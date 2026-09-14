/**
 * 离线收益服务（P4.2；§22 修订挂机点与互斥；§23 A3 改为「循环整轮」）
 *
 * ⚠️ **临时方案（TEMPORARY-OFFLINE-IDLE）**：本文件实现的「离线时间 × 效率 = 一次结算」
 * 是**过渡实现**，**不是**挂机的终态设计。终态由**战斗逻辑服**在服务端**实时**推进挂机战斗
 * （原因：组队开战后无法保证队员全程在线，战斗必须与"谁在线"解耦）。
 * 用户 2026-09-15 复核：当前实现**符合最低预期，作为临时方案接受**。
 * 标记登记表 / 退出条件 / 终态待清理项见
 * `ai-docs/frontend-solution-exploration/23-挂机开发交接.md` §0.1 —— **勿在此临时实现上做长期投入**。
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
 *   直接拒绝（`ONLINE_BATTLE_ACTIVE`）—— 不是暂停计时，是**拒绝结算**。
 *
 * §23 A3 修订（用户 2026-09-14 拍板）：
 * - 挂机**不再打最深层**（旧实现已突破秘境的 floor 恒为 Boss 层 ⇒ 一直在打 Boss），
 *   改为 `zone.idlePlan` 给出的**整轮逐层计划**：总击杀按「循环整轮」摊到 1..maxFloor，
 *   每层用自己的单位 / 层灵韵 / 掉落档各结算一次，最后聚合（见 `idle-settlement.ts`）。
 * - ⚠️ 「循环整轮」同样属于上面那个**临时方案**（真逻辑服不可能靠"按层均分击杀"模拟战斗）。
 *
 * 不变式（**绝不能破坏**）：
 * 1. 离线时间只换产出，**不换进度** —— 不涨层、不给 `clears`、不写 `game_zone_progress`；
 * 2. 客户端不本地算产出；3. 在线战斗期间挂机被拒；4. 特殊秘境不可挂机；5. 未突破不可挂机。
 */
import { Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../../common/config/app-config.js';
import { CharacterService } from '../../../character/character.service.js';
import { DatabaseService } from '../../../database/database.service.js';
import { GameDatabaseService } from '../../../game/game-database.service.js';
import { CombatLogicService } from '../../combat/combat.logic.service.js';
import type { SettlementData } from '../../combat/combat.api.js';
import { type FailResult, fail } from '../../../../common/kernel/result.js';
import type { ZoneIdlePlan } from '../../zone/zone.api.js';
import { ZoneLogicService } from '../../zone/zone.logic.service.js';
import { aggregateSettlement, splitKillsByFloor, type AggregatedSettlement } from './idle-settlement.js';

interface SettleAnchorRow {
  last_settle_at: Date | string | null;
}

interface CountRow {
  items_produced: number;
}

/** 逐层战果（A3：整轮挂机不再有单一单位，逐层列出实际打到的层）。 */
export interface IdleFloorOutcome {
  floor: number;
  unitCode: string;
  unitName: string;
  isBoss: boolean;
  kills: number;
}

/** 结算秘境（A3：`maxFloor` = 一整轮的层数）。 */
export interface IdleSettleZoneOutcome {
  code: string;
  name: string;
  maxFloor: number;
}

/** 逐层结算的中间结果（全部层都成功才有 `ok:true`）。 */
type WholeRoundResult =
  | { ok: true; aggregated: AggregatedSettlement; floors: IdleFloorOutcome[] }
  | { ok: false; result: FailResult };

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

  /** 「暂无可结算收益」分支的响应体（全零 + 挂机点字段置空）。 */
  private emptySettleData(realm: { offlineHours: number; effectiveHours: number }, produced: number, lingyunTotal: number) {
    return {
      offlineHours: realm.offlineHours,
      effectiveHours: realm.effectiveHours,
      kills: 0,
      lingyunGained: 0,
      lingyunTotal,
      items: [],
      kept: 0,
      salvaged: { count: 0, lingyun: 0 },
      sold: { count: 0, spiritStones: 0 },
      discarded: 0,
      blockedByTier: 0,
      currencies: {},
      essences: {},
      itemsProduced: 0,
      zone: null,
      floors: [],
      dailyItemsProduced: produced,
      dailyItemCap: APP_CONFIG.idleDailyItemCap,
    };
  }

  /**
   * A3：把一个「整轮」的击杀逐层结算。
   *
   * - **0 杀的层直接跳过**：`settleKills` 的层灵韵是「每次调用加一次」，空调用会白送灵韵
   *   （kills 不足一层时尤其明显：kills=1 + 3 层 → 只结第 1 层）；
   * - `itemBudget` 逐层递减（`budget - 已用`），层间**不得**把每日额度用超；
   * - 任一层失败**原样返回失败**（不吞错）。⚠️ 已知取舍：失败前已成功的层产出已经落库、
   *   且不刷新 `last_settle_at`，因此理论上可被重试再拿一次 —— 这是"临时方案"（§0.1）
   *   下接受的代价，补偿性回滚需要跨表事务，不在本轮范围（单测钉住当前行为）。
   */
  private async settleWholeRound(characterId: number, kills: number, budget: number, zonePlan: ZoneIdlePlan): Promise<WholeRoundResult> {
    const allocation = splitKillsByFloor(kills, zonePlan.floors.length);
    const parts: SettlementData[] = [];
    const floors: IdleFloorOutcome[] = [];
    let used = 0;

    for (let index = 0; index < zonePlan.floors.length; index++) {
      const floor = zonePlan.floors[index];
      if (floor === undefined) continue;
      const floorKills = allocation[index] ?? 0;
      if (floorKills <= 0) continue;
      const settled = await this.combatLogic.settleKills(characterId, floor.unitCode, floorKills, {
        itemBudget: Math.max(0, budget - used),
        lingyunBonusFlat: floor.lingyunBonusFlat,
        tierOffsetBonus: floor.tierOffsetBonus,
        dropDrawBonus: floor.dropDrawBonus,
      });
      if (!settled.ok) return settled;
      parts.push(settled.data);
      used += settled.data.itemsProduced;
      floors.push({
        floor: floor.floor,
        unitCode: settled.data.unit.code,
        unitName: settled.data.unit.name,
        isBoss: floor.isBoss,
        kills: floorKills,
      });
    }

    return { ok: true, aggregated: aggregateSettlement(parts, kills), floors };
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

    // ===== §22 Q6：在线战斗期间强制关闭离线挂机 =====
    // 判据是 `game_zone_state` 有行（正在某秘境里打），而不是「页面在不在线」。
    // 打满 3 层会自动退出（online tick 调 leaveBattle），挂机随行清除而恢复。
    //
    // ⚠️ **位置在「暂无可结算收益」之前**（2026-09-14 真后端 e2e 抓到的顺序缺陷）：
    // 若放在后面，玩家在战斗中且离线时长不足时收到的是「暂无可结算收益」——
    // 那句话既不真（真正原因是战斗中）也不解决问题。状态闸门必须先于数量判断。
    if (await this.zoneLogic.inOnlineBattle(character.id)) {
      return fail('ONLINE_BATTLE_ACTIVE', '在线战斗中，离线挂机已暂停（离开秘境后恢复）');
    }

    const last = await this.lastSettleAt(character.id);
    const elapsedHours = hoursOverride != null ? hoursOverride : (Date.now() - last.getTime()) / 3_600_000;
    const plan = this.plan(elapsedHours);
    const produced = await this.producedToday(character.id);

    if (plan.kills <= 0 && hoursOverride == null) {
      return {
        success: true,
        message: '暂无可结算收益',
        data: this.emptySettleData(plan, produced, character.lingyun),
      };
    }

    const budget = Math.max(0, APP_CONFIG.idleDailyItemCap - produced);
    // unitCode 显式给出（`idle.action` 的调试参数）→ 单单位旧口径，不查挂机点、不按层分摊。
    const explicitUnit = unitCodeInput && unitCodeInput.trim() ? unitCodeInput.trim() : undefined;

    let aggregated: AggregatedSettlement;
    let zone: IdleSettleZoneOutcome | null = null;
    let floors: IdleFloorOutcome[] = [];
    let message: string;

    if (explicitUnit !== undefined) {
      const settled = await this.combatLogic.settleKills(character.id, explicitUnit, plan.kills, { itemBudget: budget });
      if (!settled.ok) return settled.result;
      aggregated = aggregateSettlement([settled.data], plan.kills);
      message = '离线结算完成：' + settled.data.unit.name + ' ×' + plan.kills;
    } else {
      // §23 A3：挂机点 = game_idle_state（zone.idleTarget 写入；需已突破且 idle_allowed）。
      // `idlePlan` 返回 null 只有两种原因：没设挂机点 / 挂机点不再满足资格。
      const zonePlan = await this.zoneLogic.idlePlan(character.id);
      if (!zonePlan) return fail('IDLE_TARGET_NOT_SET', '尚未设置挂机点（请先在秘境页面选择已突破的秘境）');

      const round = await this.settleWholeRound(character.id, plan.kills, budget, zonePlan);
      if (!round.ok) return round.result;
      aggregated = round.aggregated;
      floors = round.floors;
      zone = { code: zonePlan.zoneCode, name: zonePlan.zoneName, maxFloor: zonePlan.maxFloor };
      message = '离线结算完成：' + zonePlan.zoneName + ' ×' + floors.length + ' 层（共 ' + plan.kills + ' 击）';
    }

    const counter = await this.gameDb.query<CountRow>(
      `INSERT INTO game_idle_counters (character_id, day, items_produced)
       VALUES ($1, CURRENT_DATE, $2)
       ON CONFLICT (character_id, day)
       DO UPDATE SET items_produced = game_idle_counters.items_produced + EXCLUDED.items_produced, updated_at = CURRENT_TIMESTAMP
       RETURNING items_produced`,
      [character.id, aggregated.itemsProduced],
    );
    await this.userDb.query('UPDATE characters SET last_settle_at = CURRENT_TIMESTAMP WHERE id = $1', [character.id]);

    const dailyItemsProduced = counter.rows[0]
      ? Number(counter.rows[0].items_produced)
      : produced + aggregated.itemsProduced;
    return {
      success: true,
      message,
      data: {
        ...aggregated,
        zone,
        floors,
        offlineHours: plan.offlineHours,
        effectiveHours: plan.effectiveHours,
        dailyItemsProduced,
        dailyItemCap: APP_CONFIG.idleDailyItemCap,
      },
    };
  }
}
