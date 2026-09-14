/**
 * 离线收益服务（P4.2；§22 修订挂机点与互斥）
 *
 * 公式（v2 §9.2）：有效小时 = min(离线小时, idleMaxOfflineHours) × idleEfficiencyPct%
 *                 击杀数 = floor(有效小时 × idleRoundsPerHour)
 * - 复用 UnitService.settleKills（灵韵 + 掉落 + 辨宝法阵）
 * - 日物品上限走 game_idle_counters（达到上限后仅停发物品，灵韵/通货/精华照常）
 * - 计时锚点 characters.last_settle_at；结算成功即刷新
 * - hours 覆盖仅非生产环境可用（生产 → FORBIDDEN）
 *
 * §22 修订：
 * - **挂机点 = `game_idle_state`**（由 `zone.idleTarget` 写入），只认已突破且
 *   `idle_allowed` 的秘境；不再有「已解锁最低 order 兜底」；
 * - **在线战斗互斥**（用户 Q6）：`game_zone_state` 有行 = 在线战斗中 ⇒ `idle.settle`
 *   直接拒绝（`ONLINE_BATTLE_ACTIVE`）—— 不是暂停计时，是**拒绝结算**；
 * - 挂机打的是**已突破秘境的最深层**（`zone.idleEncounter` 用 `min(progress.floor, maxFloor)`）。
 */
import { Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../../common/config/app-config.js';
import { CharacterService } from '../../../character/character.service.js';
import { DatabaseService } from '../../../database/database.service.js';
import { GameDatabaseService } from '../../../game/game-database.service.js';
import { CombatLogicService } from '../../combat/combat.logic.service.js';
import { type FailResult, fail } from '../../../../common/kernel/result.js';
import { ZoneLogicService } from '../../zone/zone.logic.service.js';

interface SettleAnchorRow {
  last_settle_at: Date | string | null;
}

interface CountRow {
  items_produced: number;
}

@Injectable()
export class IdleService {
  constructor(
    private readonly gameDb: GameDatabaseService,
    private readonly userDb: DatabaseService,
    private readonly characterService: CharacterService,
    private readonly combatLogic: CombatLogicService,
    private readonly zoneLogic: ZoneLogicService,
  ) {}

  private async resolveCharacter(userId: number) {
    const character = await this.characterService.findByUserId(userId);
    if (!character) return { error: fail('CHARACTER_NOT_FOUND', '尚未创建角色') as FailResult };
    return { character };
  }

  private async lastSettleAt(characterId: number): Promise<Date> {
    const rows = await this.userDb.query<SettleAnchorRow>(
      'SELECT last_settle_at FROM characters WHERE id = $1',
      [characterId],
    );
    const raw = rows.rows[0] ? rows.rows[0].last_settle_at : null;
    return raw ? new Date(raw) : new Date();
  }

  private async producedToday(characterId: number): Promise<number> {
    const rows = await this.gameDb.query<CountRow>(
      'SELECT items_produced FROM game_idle_counters WHERE character_id = $1 AND day = CURRENT_DATE',
      [characterId],
    );
    return rows.rows[0] ? Number(rows.rows[0].items_produced) : 0;
  }

  /** 离线时长 → 有效小时与击杀数 */
  private plan(elapsedHours: number) {
    const offlineHours = Math.max(0, Math.min(elapsedHours, APP_CONFIG.idleMaxOfflineHours));
    // 整数化计算规避浮点误差（如 12 × 60% × 60 = 431.999…）；effectiveHours 仅展示
    const effectiveHours = Math.round(offlineHours * APP_CONFIG.idleEfficiencyPct) / 100;
    const kills = Math.floor(
      (offlineHours * APP_CONFIG.idleRoundsPerHour * APP_CONFIG.idleEfficiencyPct) / 100,
    );
    return { offlineHours, effectiveHours, kills };
  }

  private realmLingyun(realm: number): number {
    const rb = APP_CONFIG.unitRealmBase.lingyun;
    return Math.round(rb.base * Math.pow(rb.growth, realm - 1));
  }

  private configView() {
    return {
      roundsPerHour: APP_CONFIG.idleRoundsPerHour,
      efficiencyPct: APP_CONFIG.idleEfficiencyPct,
      maxOfflineHours: APP_CONFIG.idleMaxOfflineHours,
    };
  }

  async status(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const last = await this.lastSettleAt(character.id);
    const elapsedHours = (Date.now() - last.getTime()) / 3_600_000;
    const plan = this.plan(elapsedHours);
    const produced = await this.producedToday(character.id);
    return {
      success: true,
      message: '获取离线状态成功',
      data: {
        realm: character.realm,
        lastSettleAt: last.toISOString(),
        pendingHours: Math.max(0, elapsedHours),
        effectiveHours: plan.effectiveHours,
        estimatedKills: plan.kills,
        estimatedLingyun: this.realmLingyun(character.realm) * plan.kills,
        dailyItemsProduced: produced,
        dailyItemCap: APP_CONFIG.idleDailyItemCap,
        config: this.configView(),
      },
    };
  }

  async settle(
    userId: number,
    unitCodeInput?: string,
    hoursOverride?: number,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;

    if (hoursOverride != null) {
      if (!Number.isFinite(hoursOverride) || hoursOverride < 0 || hoursOverride > 10000) {
        return fail('INVALID_PARAM', 'hours 需为 0~10000 的数值');
      }
      if ((process.env.NODE_ENV ?? 'development') === 'production') {
        return fail('FORBIDDEN', '生产环境不支持离线时长覆盖');
      }
    }

    const last = await this.lastSettleAt(character.id);
    const elapsedHours = hoursOverride != null ? hoursOverride : (Date.now() - last.getTime()) / 3_600_000;
    const plan = this.plan(elapsedHours);
    const produced = await this.producedToday(character.id);

    if (plan.kills <= 0 && hoursOverride == null) {
      return {
        success: true,
        message: '暂无可结算收益',
        data: {
          unit: null,
          offlineHours: plan.offlineHours,
          effectiveHours: plan.effectiveHours,
          kills: 0,
          lingyunGained: 0,
          lingyunTotal: character.lingyun,
          items: [],
          kept: 0,
          salvaged: { count: 0, lingyun: 0 },
          sold: { count: 0, spiritStones: 0 },
          discarded: 0,
          blockedByTier: 0,
          currencies: {},
          essences: {},
          itemsProduced: 0,
          dailyItemsProduced: produced,
          dailyItemCap: APP_CONFIG.idleDailyItemCap,
        },
      };
    }

    // ===== §22 Q6：在线战斗期间强制关闭离线挂机 =====
    // 判据是 `game_zone_state` 有行（正在某秘境里打），而不是「页面在不在线」。
    // 打满 3 层会自动退出（online tick 调 leaveBattle），挂机随行清除而恢复。
    if (await this.zoneLogic.inOnlineBattle(character.id)) {
      return fail('ONLINE_BATTLE_ACTIVE', '在线战斗中，离线挂机已暂停（离开秘境后恢复）');
    }

    // unitCode 缺省 → 挂机点遭遇单位（Boss 层取 bossCode）
    let unitCode = unitCodeInput && unitCodeInput.trim() ? unitCodeInput.trim() : undefined;
    let zoneInfo: { code: string; name: string; floor: number; isBoss: boolean } | null = null;
    if (!unitCode) {
      // §22：挂机点 = game_idle_state（zone.idleTarget 写入；需已突破且 idle_allowed）。
      // `idleEncounter` 返回 null 只有两种原因：没设挂机点 / 挂机点不再满足资格。
      const encounter = await this.zoneLogic.idleEncounter(character.id);
      if (!encounter) return fail('IDLE_TARGET_NOT_SET', '尚未设置挂机点（请先在秘境页面选择已突破的秘境）');

      unitCode = encounter.unitCode;
      zoneInfo = {
        code: encounter.zoneCode,
        name: encounter.zoneName,
        floor: encounter.floor,
        isBoss: encounter.isBoss,
      };
    }

    const budget = Math.max(0, APP_CONFIG.idleDailyItemCap - produced);
    const settled = await this.combatLogic.settleKills(character.id, unitCode, plan.kills, { itemBudget: budget });
    if (!settled.ok) return settled.result;

    const counter = await this.gameDb.query<CountRow>(
      `INSERT INTO game_idle_counters (character_id, day, items_produced)
       VALUES ($1, CURRENT_DATE, $2)
       ON CONFLICT (character_id, day)
       DO UPDATE SET items_produced = game_idle_counters.items_produced + EXCLUDED.items_produced, updated_at = CURRENT_TIMESTAMP
       RETURNING items_produced`,
      [character.id, settled.data.itemsProduced],
    );
    await this.userDb.query('UPDATE characters SET last_settle_at = CURRENT_TIMESTAMP WHERE id = $1', [character.id]);

    const dailyItemsProduced = counter.rows[0]
      ? Number(counter.rows[0].items_produced)
      : produced + settled.data.itemsProduced;
    return {
      success: true,
      message: '离线结算完成：' + settled.data.unit.name + ' ×' + plan.kills,
      data: {
        ...settled.data,
        zone: zoneInfo,
        offlineHours: plan.offlineHours,
        effectiveHours: plan.effectiveHours,
        dailyItemsProduced,
        dailyItemCap: APP_CONFIG.idleDailyItemCap,
      },
    };
  }
}
