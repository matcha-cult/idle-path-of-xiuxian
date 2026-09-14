/**
 * 秘境服务（§22 重做，2026-09-14 晚）
 *
 * 语义（用户 8 答，任务书 22 §1）：
 * - 秘境 = `game_zones` 里按境界分档的 13 条记录，与地图节点**彻底解耦**；
 * - **突破**（`zone.breakthrough`）= 与「秘境石台」对象交互 → 进入在线战斗。
 *   准入只看「要不要道具」：training 免费、special 需道具（本轮道具未实装 → 一律
 *   `ZONE_ITEM_REQUIRED`）。**不校验境界、不校验战力**（"进去送人头都行"）；
 * - **解锁** = 在线打满 3 层 → `clears` +1 → `cleared`；已解锁秘境出现在秘境页面；
 * - **挂机** = 已解锁 ∧ `idle_allowed` 的秘境（写 `game_idle_state`）；
 * - 在线战斗（`game_zone_state` 有行）期间**离线挂机暂停**；打满 3 层**自动离开**；
 * - `zone.challenge` 降级为开发者工具（R2 §4.3），UI 不再有「挑战本层」按钮。
 *
 * 表：
 * - `game_zones` 配置；`game_zone_progress(floor/best_floor/cleared/clears)` 玩家进度；
 * - `game_zone_state` = 在线战斗所在（有行 ⇒ 在线 ⇒ 挂机暂停）；
 * - `game_idle_state` = 离线挂机目标。两件事可同时存在，表也分开（§22 §5.3）。
 */
import { Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../../common/config/app-config.js';
import { CharacterService } from '../../../character/character.service.js';
import { PlayerPowerService } from '../../../character/player-power.service.js';
import { GameDatabaseService } from '../../../game/game-database.service.js';
import { CombatLogicService } from '../../combat/combat.logic.service.js';
import {
  type FailResult,
  type ZoneIdleFloor,
  type ZoneIdlePlan,
  type ZoneIdleStateRow,
  type ZoneProgressRow,
  type ZoneProgressView,
  type ZoneRow,
  type ZoneStateRow,
  type ZoneOnlineContext,
  accessOf,
  dropDrawBonusFor,
  fail,
  floorRequirement,
  idleEligible,
  isBossFloor,
  isUnlocked,
  progressOf,
  tierOffsetBonusFor,
  zoneRealm,
  zoneTierKind,
} from './zone.types.js';

/** 「进入一场秘境战斗」的公共响应体（enter / breakthrough 同构）。 */
interface ZoneBattleEntry {
  currentZone: { code: string; name: string; realm: number };
  floor: number;
  bestFloor: number;
  clears: number;
}

@Injectable()
export class ZoneService {
  constructor(
    private readonly gameDb: GameDatabaseService,
    private readonly characterService: CharacterService,
    private readonly combatLogic: CombatLogicService,
    private readonly playerPowerService: PlayerPowerService,
  ) {}

  private async resolveCharacter(userId: number) {
    const character = await this.characterService.findByUserId(userId);
    if (!character) return { error: fail('CHARACTER_NOT_FOUND', '尚未创建角色') as FailResult };
    return { character };
  }

  /**
   * 玩家战力（§6.1，唯一实现在 `character/player-power.service.ts`）。
   * map 域的地图节点门槛复用同一实现，避免两套战力口径漂移。
   */
  playerPower(characterId: number, realm: number): Promise<number> {
    return this.playerPowerService.compute(characterId, realm);
  }

  private async allZones(): Promise<ZoneRow[]> {
    const rows = await this.gameDb.query<ZoneRow>('SELECT * FROM game_zones ORDER BY order_index, id');
    return rows.rows;
  }

  private async progressRows(characterId: number): Promise<ZoneProgressRow[]> {
    const rows = await this.gameDb.query<ZoneProgressRow>(
      'SELECT * FROM game_zone_progress WHERE character_id = $1',
      [characterId],
    );
    return rows.rows;
  }

  private async zoneByCode(code: string): Promise<ZoneRow | null> {
    const rows = await this.gameDb.query<ZoneRow>('SELECT * FROM game_zones WHERE code = $1', [code]);
    return rows.rows[0] ?? null;
  }

  private async zoneById(id: number): Promise<ZoneRow | null> {
    const rows = await this.gameDb.query<ZoneRow>('SELECT * FROM game_zones WHERE id = $1', [id]);
    return rows.rows[0] ?? null;
  }

  private async progressRow(characterId: number, zoneId: number): Promise<ZoneProgressRow | null> {
    const rows = await this.gameDb.query<ZoneProgressRow>(
      'SELECT * FROM game_zone_progress WHERE character_id = $1 AND zone_id = $2',
      [characterId, zoneId],
    );
    return rows.rows[0] ?? null;
  }

  private progressMap(rows: ZoneProgressRow[]): Map<number, ZoneProgressRow> {
    return new Map(rows.map((r) => [Number(r.zone_id), r]));
  }

  /** 在线战斗所在（无行 = 不在任何秘境战斗 = 离线挂机可用）。 */
  private async battleStateRow(characterId: number): Promise<ZoneStateRow | null> {
    const rows = await this.gameDb.query<ZoneStateRow>(
      'SELECT * FROM game_zone_state WHERE character_id = $1',
      [characterId],
    );
    return rows.rows[0] ?? null;
  }

  /** 挂机点（无行 = 尚未设置挂机点）。 */
  private async idleStateRow(characterId: number): Promise<ZoneIdleStateRow | null> {
    const rows = await this.gameDb.query<ZoneIdleStateRow>(
      'SELECT * FROM game_idle_state WHERE character_id = $1',
      [characterId],
    );
    return rows.rows[0] ?? null;
  }

  /** 写入「当前在哪个秘境战斗」（§22 §2.2：有行 ⇒ 离线挂机暂停）。 */
  private async setBattleState(characterId: number, zoneId: number): Promise<void> {
    await this.gameDb.query(
      `INSERT INTO game_zone_state (character_id, current_zone_id, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (character_id) DO UPDATE SET current_zone_id = EXCLUDED.current_zone_id, updated_at = CURRENT_TIMESTAMP`,
      [characterId, zoneId],
    );
  }

  /** 离开秘境：清掉在线战斗行（§22 Q3 打满 3 层自动退出的落点）。 */
  async leaveBattle(characterId: number): Promise<{ left: boolean }> {
    const row = await this.battleStateRow(characterId);
    if (!row) return { left: false };
    await this.gameDb.query('DELETE FROM game_zone_state WHERE character_id = $1', [characterId]);
    return { left: true };
  }

  /** 供 idle 域复用：在线战斗中（`game_zone_state` 有行）⇒ 离线挂机暂停（§22 Q6）。 */
  async inOnlineBattle(characterId: number): Promise<boolean> {
    return (await this.battleStateRow(characterId)) !== null;
  }

  /** 层深度派生：tierOffset 加成、额外掉落判定、是否 Boss 层 */
  private depth(zone: ZoneRow, floor: number) {
    const boss = isBossFloor(zone, floor);
    const tierOffset = tierOffsetBonusFor(zone, floor);
    const extraDraws = dropDrawBonusFor(zone, floor) + (boss ? APP_CONFIG.zoneBossExtraDraws : 0);
    return { boss, tierOffset, extraDraws };
  }

  /**
   * 开一轮战斗：把 `floor` 归到该轮应有的起点（§22 §2.2）。
   *
   * 规则：**已突破（clears ≥ 1）的秘境**才重置 —— 打满 3 层后 `floor` 停在 `max_floor`，
   * 再来一次要回到第 1 层（重复挑战是"一轮一轮"的）；未突破的半程跑（打到第 2 层手动退出）
   * **保留进度**，回来接着打。未突破且从未打过的行不存在（progressOf 缺省 floor=1）。
   *
   * ⚠️ 只动 `floor`：`cleared` / `clears` 是解锁证据，**绝不回退**。
   */
  private async startRun(characterId: number, zoneId: number, view: ZoneProgressView): Promise<ZoneProgressView> {
    const mustReset = isUnlocked(view) && view.floor > 1;
    if (!mustReset) return view;
    await this.gameDb.query(
      `INSERT INTO game_zone_progress (character_id, zone_id, floor, best_floor, cleared, clears)
       VALUES ($1, $2, 1, $3, TRUE, $4)
       ON CONFLICT (character_id, zone_id)
       DO UPDATE SET floor = 1, cleared = TRUE, updated_at = CURRENT_TIMESTAMP`,
      [characterId, zoneId, view.bestFloor, view.clears],
    );
    return { floor: 1, bestFloor: view.bestFloor, cleared: true, clears: view.clears };
  }

  /**
   * 在线历练的层推进落库（P3.0 T4 保留，§22 加 `clears`）：
   * 与 `challenge` 同一张表、同一 `GREATEST` 口径。
   *
   * §22 差异：
   * - 通关（nextFloor > maxFloor）时 `clears` **+1**（打满一轮）且 `floor` 停在上限；
   * - **不加回退**：首轮通关 `clears 0→1` 就是"解锁"，由调用方（在线 tick）据证发解锁事件；
   * - `cleared` 与 `clears ≥ 1` 恒同步（列保留给既有 SQL / 展示）。
   *
   * @returns 落库后的 `{ floor, bestFloor, cleared, clears }`
   */
  async advanceFloor(
    characterId: number,
    zoneId: number,
    input: { floor: number; bestFloor: number; maxFloor: number },
  ): Promise<{ floor: number; bestFloor: number; cleared: boolean; clears: number }> {
    const nextFloor = input.floor + 1;
    const completedRun = nextFloor > input.maxFloor;
    const storedFloor = completedRun ? input.maxFloor : nextFloor;
    const nextBest = Math.max(input.bestFloor, input.floor);
    const rows = await this.gameDb.query<ZoneProgressRow>(
      `INSERT INTO game_zone_progress (character_id, zone_id, floor, best_floor, cleared, clears)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (character_id, zone_id) DO UPDATE SET
         floor = EXCLUDED.floor,
         best_floor = GREATEST(game_zone_progress.best_floor, EXCLUDED.best_floor),
         cleared = EXCLUDED.cleared,
         clears = game_zone_progress.clears + EXCLUDED.clears,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [characterId, zoneId, storedFloor, nextBest, completedRun, completedRun ? 1 : 0],
    );
    const row = rows.rows[0];
    return {
      floor: storedFloor,
      bestFloor: nextBest,
      cleared: completedRun,
      clears: row ? Number(row.clears) : input.floor >= input.maxFloor ? 1 : 0,
    };
  }

  private battleEntry(zone: ZoneRow, view: ZoneProgressView): ZoneBattleEntry {
    return {
      currentZone: { code: zone.code, name: zone.name, realm: zoneRealm(zone) },
      floor: view.floor,
      bestFloor: view.bestFloor,
      clears: view.clears,
    };
  }

  /**
   * §23 A3：挂机点的**整轮计划**（逐层单位 / 门槛 / 层深加成）。
   *
   * 返回 `null` 只有两种原因（与旧 `idleEncounter` 一致，idle 域不区分）：
   * 没设挂机点 / 挂机点已不满足 `idleEligible`（未突破 ∨ `idle_allowed=false`）。
   *
   * ⚠️ 与旧实现的关键差别：**不再**取 `min(progress.floor, maxFloor)` 当唯一遭遇层。
   * 已突破秘境的 `progress.floor` 恒为 `max_floor`（= Boss 层）⇒ 旧实现挂机永远在打 Boss。
   * 现在恒返回 1..maxFloor 全部层，由 idle 域按「循环整轮」把击杀摊到各层。
   */
  async idlePlan(characterId: number): Promise<ZoneIdlePlan | null> {
    const idleState = await this.idleStateRow(characterId);
    if (!idleState) return null;
    const zone = await this.zoneById(Number(idleState.zone_id));
    if (!zone) return null;
    const progress = progressOf(await this.progressRow(characterId, zone.id));
    if (!idleEligible(zone, progress)) return null;
    // `max_floor` 可能是 0 / 负数 / NaN（脏种子）：收敛为单层，绝不产生空计划。
    const raw = Number(zone.max_floor);
    const maxFloor = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
    const floors: ZoneIdleFloor[] = [];
    for (let floor = 1; floor <= maxFloor; floor++) {
      const { boss, tierOffset, extraDraws } = this.depth(zone, floor);
      floors.push({
        floor,
        unitCode: boss && zone.boss_code ? zone.boss_code : zone.unit_code,
        isBoss: boss,
        floorRequirement: floorRequirement(zone, floor),
        lingyunBonusFlat: floor * Number(zone.lingyun_bonus_per_floor),
        tierOffsetBonus: tierOffset,
        dropDrawBonus: extraDraws,
      });
    }
    return { zoneCode: zone.code, zoneName: zone.name, realm: zoneRealm(zone), maxFloor, floors };
  }

  /**
   * 在线历练上下文（P3.0 T4 保留 + §22 `clears`）：只认 `zone.enter` / `zone.breakthrough`
   * 写入的**当前战斗**（`game_zone_state` 有行），**没有"已解锁最低 order 兜底"** ——
   * 否则一个从未进过秘境的人会被自动算成"正在战斗"。
   * 没有当前战斗 → 返回 `null`（tick 不推进；面板给 reason='no_battle'）。
   */
  async onlineContext(characterId: number, realm: number): Promise<ZoneOnlineContext | null> {
    const state = await this.battleStateRow(characterId);
    const zoneId = state?.current_zone_id;
    if (zoneId == null) return null;
    const zone = await this.zoneById(Number(zoneId));
    if (!zone) return null;
    const progress = progressOf(await this.progressRow(characterId, zone.id));
    const power = await this.playerPower(characterId, realm);
    const { boss, tierOffset, extraDraws } = this.depth(zone, progress.floor);
    return {
      zoneId: Number(zone.id),
      zoneCode: zone.code,
      zoneName: zone.name,
      realm: zoneRealm(zone),
      maxFloor: Number(zone.max_floor),
      floor: progress.floor,
      bestFloor: progress.bestFloor,
      cleared: progress.cleared && progress.floor >= Number(zone.max_floor),
      clears: progress.clears,
      playerPower: power,
      floorRequirement: floorRequirement(zone, progress.floor),
      isBossFloor: boss,
      unitCode: boss && zone.boss_code ? zone.boss_code : zone.unit_code,
      lingyunBonusFlat: progress.floor * Number(zone.lingyun_bonus_per_floor),
      tierOffsetBonus: tierOffset,
      dropDrawBonus: extraDraws,
    };
  }

  /**
   * 秘境图鉴（§22 Q4：**只下发已突破的秘境**）+ 突破名录（全部 13 境）+ 挂机点。
   *
   * 两个数组各司其职：
   * - `zones`：已突破（`clears ≥ 1`）→ 秘境页面（用户 Q4「未解锁的不在秘境页面显示」）；
   * - `breakthrough`：全部 13 境 → 第八峰·后山「秘境石台」的突破选择（用户 Q1/Q3）；
   * - `idleTarget`：当前挂机点 code（秘境页面展示 / 切换）。
   */
  async catalog(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const [zones, power, progressRows, battleState, idleState] = await Promise.all([
      this.allZones(),
      this.playerPower(character.id, character.realm),
      this.progressRows(character.id),
      this.battleStateRow(character.id),
      this.idleStateRow(character.id),
    ]);
    const map = this.progressMap(progressRows);
    const currentZoneId = battleState ? Number(battleState.current_zone_id) : null;
    const currentCode = currentZoneId != null ? (zones.find((z) => Number(z.id) === currentZoneId)?.code ?? null) : null;
    const idleCode = idleState ? (zones.find((z) => Number(z.id) === Number(idleState.zone_id))?.code ?? null) : null;

    const cleared = zones.filter((z) => isUnlocked(progressOf(map.get(Number(z.id)) ?? null)));
    const views = cleared.map((z) => {
      const progress = progressOf(map.get(Number(z.id)) ?? null);
      return {
        id: z.id,
        code: z.code,
        name: z.name,
        realm: zoneRealm(z),
        tierKind: zoneTierKind(z),
        orderIndex: z.order_index,
        idleAllowed: z.idle_allowed === true,
        unlockItemCode: z.unlock_item_code ?? null,
        unitCode: z.unit_code,
        bossCode: z.boss_code,
        basePower: z.base_power,
        powerStep: z.power_step,
        maxFloor: z.max_floor,
        lingyunBonusPerFloor: z.lingyun_bonus_per_floor,
        current: Number(z.id) === currentZoneId,
        progress,
      };
    });

    const breakthrough = zones.map((z) => {
      const access = accessOf(z);
      const progress = progressOf(map.get(Number(z.id)) ?? null);
      return {
        code: z.code,
        name: z.name,
        realm: zoneRealm(z),
        tierKind: zoneTierKind(z),
        canBreakthrough: access.canBreakthrough,
        lockReason: access.reason,
        unlockItemCode: access.itemCode,
        cleared: isUnlocked(progress),
        clears: progress.clears,
        bestFloor: progress.bestFloor,
        maxFloor: z.max_floor,
        basePower: z.base_power,
        powerStep: z.power_step,
      };
    });

    return {
      success: true,
      message: '获取秘境图鉴成功',
      data: {
        total: views.length,
        playerPower: power,
        currentZone: currentCode,
        idleTarget: idleCode,
        zones: views,
        breakthrough,
      },
    };
  }

  /** 当前在线战斗的进度（无当前战斗 → `NO_ONLINE_BATTLE`，属预期分支）。 */
  async progress(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const state = await this.battleStateRow(character.id);
    if (!state) return fail('NO_ONLINE_BATTLE', '当前不在秘境中');
    const zone = await this.zoneById(Number(state.current_zone_id));
    if (!zone) {
      // 战斗行指向已删秘境（种子重灌前的老数据）：清掉，避免「在线战斗」永久为真
      await this.leaveBattle(character.id);
      return fail('NO_ONLINE_BATTLE', '当前不在秘境中');
    }
    const progress = progressOf(await this.progressRow(character.id, zone.id));
    const power = await this.playerPower(character.id, character.realm);
    const req = floorRequirement(zone, progress.floor);
    const { boss, tierOffset, extraDraws } = this.depth(zone, progress.floor);
    return {
      success: true,
      message: '获取秘境进度成功',
      data: {
        currentZone: { code: zone.code, name: zone.name, realm: zoneRealm(zone) },
        floor: progress.floor,
        bestFloor: progress.bestFloor,
        clears: progress.clears,
        cleared: progress.cleared,
        playerPower: power,
        floorRequirement: req,
        isBossFloor: boss,
        lingyunBonus: progress.floor * zone.lingyun_bonus_per_floor,
        dropTierOffset: tierOffset,
        extraDropDraws: extraDraws,
      },
    };
  }

  /** 进入一场**已突破**秘境的战斗（重复挑战入口；§22 Q3 只经此处与 breakthrough）。 */
  async enter(userId: number, zoneCode: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const zone = await this.zoneByCode(zoneCode);
    if (!zone) return fail('ZONE_NOT_FOUND', '秘境不存在：' + zoneCode);
    const view = progressOf(await this.progressRow(character.id, zone.id));
    if (!isUnlocked(view)) {
      return fail(
        'ZONE_NOT_UNLOCKED',
        '尚未突破该秘境：' + zone.name + '（需在线打满 ' + zone.max_floor + ' 层解锁）',
      );
    }
    const started = await this.startRun(character.id, zone.id, view);
    await this.setBattleState(character.id, zone.id);
    return {
      success: true,
      message: '已进入秘境：' + zone.name,
      data: this.battleEntry(zone, started),
    };
  }

  /**
   * 突破秘境（§22 Q1/Q3）—— 与「秘境石台」对象交互后调用。
   *
   * 准入只有一条：training 免费放行；special 需道具（本轮未实装 → `ZONE_ITEM_REQUIRED`）。
   * **不校验境界、不校验战力、不校验是否已突破**（重复挑战自由）。进入即在线战斗。
   */
  async breakthrough(userId: number, zoneCode: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const zone = await this.zoneByCode(zoneCode);
    if (!zone) return fail('ZONE_NOT_FOUND', '秘境不存在：' + zoneCode);
    const access = accessOf(zone);
    if (!access.canBreakthrough) {
      return {
        success: false,
        message: '突破需要特殊道具：' + zone.name,
        data: {
          code: 'ZONE_ITEM_REQUIRED',
          zone: { code: zone.code, name: zone.name, realm: zoneRealm(zone) },
          itemCode: access.itemCode,
        },
      };
    }
    const view = progressOf(await this.progressRow(character.id, zone.id));
    const started = await this.startRun(character.id, zone.id, view);
    await this.setBattleState(character.id, zone.id);
    return {
      success: true,
      message: '进入突破：' + zone.name,
      data: this.battleEntry(zone, started),
    };
  }

  /** 手动离开当前战斗（打满 3 层由在线 tick 自动调用；这里是玩家的「离开」按钮）。 */
  async leave(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const { left } = await this.leaveBattle(character.id);
    return {
      success: true,
      message: left ? '已离开秘境' : '当前不在秘境中',
      data: { currentZone: null, left },
    };
  }

  /** 设置离线挂机点（需**已突破**且 `idle_allowed`）。 */
  async idleTarget(userId: number, zoneCode: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const zone = await this.zoneByCode(zoneCode);
    if (!zone) return fail('ZONE_NOT_FOUND', '秘境不存在：' + zoneCode);
    const view = progressOf(await this.progressRow(character.id, zone.id));
    if (!idleEligible(zone, view)) {
      return fail(
        'ZONE_NOT_IDLE_ELIGIBLE',
        isUnlocked(view) ? '该秘境不可挂机（特殊秘境）' : '尚未突破该秘境，不能设为挂机点',
      );
    }
    await this.gameDb.query(
      `INSERT INTO game_idle_state (character_id, zone_id, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (character_id) DO UPDATE SET zone_id = EXCLUDED.zone_id, updated_at = CURRENT_TIMESTAMP`,
      [character.id, zone.id],
    );
    return {
      success: true,
      message: '已设置挂机点：' + zone.name,
      data: { idleTarget: { code: zone.code, name: zone.name, realm: zoneRealm(zone) } },
    };
  }

  /**
   * 层数挑战（**降级为开发者工具**，R2 §4.3）：无准入、无境界/战力校验门槛外的原生判定。
   *
   * 玩家侧推进一律走在线 tick（`online-explore.service.ts`）；本方法仅保留给调试与
   * 协议回归（`zone.challenge` 的既有 e2e）。仍走同一套 settleKills + advanceFloor 口径。
   */
  async challenge(userId: number, zoneCode?: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const zones = await this.allZones();
    let zone: ZoneRow | null = null;
    if (zoneCode) {
      zone = zones.find((z) => z.code === zoneCode) ?? null;
      if (!zone) return fail('ZONE_NOT_FOUND', '秘境不存在：' + zoneCode);
    } else {
      const state = await this.battleStateRow(character.id);
      zone = state ? (zones.find((z) => Number(z.id) === Number(state.current_zone_id)) ?? null) : null;
      if (!zone) return fail('NO_ONLINE_BATTLE', '当前不在秘境中');
    }

    const progress = progressOf(await this.progressRow(character.id, zone.id));
    const power = await this.playerPower(character.id, character.realm);
    const req = floorRequirement(zone, progress.floor);
    if (power < req) {
      return {
        success: false,
        message: '挑战失败：战力不足（' + power + ' < ' + req + '）',
        data: {
          code: 'CHALLENGE_FAILED',
          zone: { code: zone.code, name: zone.name },
          floor: progress.floor,
          playerPower: power,
          floorRequirement: req,
        },
      };
    }

    const { boss, tierOffset, extraDraws } = this.depth(zone, progress.floor);
    const unitCode = boss && zone.boss_code ? zone.boss_code : zone.unit_code;
    const lingyunBonus = progress.floor * zone.lingyun_bonus_per_floor;
    const settled = await this.combatLogic.settleKills(character.id, unitCode, 1, {
      lingyunBonusFlat: lingyunBonus,
      tierOffsetBonus: tierOffset,
      dropDrawBonus: extraDraws,
    });
    if (!settled.ok) return settled.result;

    const advanced = await this.advanceFloor(character.id, zone.id, {
      floor: progress.floor,
      bestFloor: progress.bestFloor,
      maxFloor: zone.max_floor,
    });
    const nextFloor = advanced.cleared ? zone.max_floor : progress.floor + 1;

    return {
      success: true,
      message: '挑战成功：' + zone.name + ' 第' + progress.floor + '层',
      data: {
        zone: { code: zone.code, name: zone.name },
        floor: progress.floor,
        nextFloor,
        bestFloor: advanced.bestFloor,
        clears: advanced.clears,
        cleared: advanced.cleared,
        playerPower: power,
        floorRequirement: req,
        isBossFloor: boss,
        dropTierOffset: tierOffset,
        extraDropDraws: extraDraws,
        rewards: {
          lingyunGained: settled.data.lingyunGained,
          lingyunBonus,
          lingyunTotal: settled.data.lingyunTotal,
          items: settled.data.items,
          kept: settled.data.kept,
          salvaged: settled.data.salvaged,
          sold: settled.data.sold,
          blockedByTier: settled.data.blockedByTier,
          currencies: settled.data.currencies,
          essences: settled.data.essences,
        },
      },
    };
  }
}