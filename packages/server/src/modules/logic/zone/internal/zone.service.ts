/**
 * 秘境服务（P5.1 + P5.2）：图鉴 / 当前秘境 / 进入 / 层数挑战
 *
 * - 战力 = realm×realmWeight + 已装备件数×equipWeight + floor(功法等级和/skillDivisor)
 * - 解锁 = realm ≥ min_realm 且 前置秘境 bestFloor ≥ require_prev_best_floor（链式，P5.2）
 * - 挑战胜利条件：playerPower ≥ basePower + (floor−1)×powerStep（确定性战力检定）
 * - 层奖励：层内单位 1 次 settleKills + floor×lingyunBonusPerFloor 灵韵加成
 * - 层深度（P5.2）：每 N 层 tierOffset +1 / 每 N 层 +1 掉落判定；Boss 层再加 zoneBossExtraDraws
 * - 进度：game_zone_progress(floor/best_floor/cleared)；当前秘境：game_zone_state
 */
import { Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../../common/config/app-config.js';
import { CharacterService } from '../../../character/character.service.js';
import { PlayerPowerService } from '../../../character/player-power.service.js';
import { GameDatabaseService } from '../../../game/game-database.service.js';
import { CombatLogicService } from '../../combat/combat.logic.service.js';
import { MapLogicService } from '../../map/map.logic.service.js';
import {
  type FailResult,
  type ZoneProgressRow,
  type ZoneRow,
  type ZoneStateRow,
  type ZoneOnlineContext,
  fail,
  dropDrawBonusFor,
  floorRequirement,
  isBossFloor,
  progressOf,
  tierOffsetBonusFor,
} from './zone.types.js';

export interface ZoneEncounter {
  zoneCode: string;
  zoneName: string;
  floor: number;
  isBoss: boolean;
  unitCode: string;
}

interface UnlockInfo {
  unlocked: boolean;
  reason: 'ok' | 'realm' | 'prev';
  realmOk: boolean;
  chainOk: boolean;
  prevZone: ZoneRow | null;
  prevBest: number;
}

@Injectable()
export class ZoneService {
  constructor(
    private readonly gameDb: GameDatabaseService,
    private readonly characterService: CharacterService,
    private readonly combatLogic: CombatLogicService,
    private readonly playerPowerService: PlayerPowerService,
    private readonly mapLogic: MapLogicService,
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

  /** 链式解锁判定 */
  private unlockInfo(zone: ZoneRow, realm: number, zones: ZoneRow[], progressByZone: Map<number, ZoneProgressRow>): UnlockInfo {
    const realmOk = realm >= zone.min_realm;
    let prevZone: ZoneRow | null = null;
    let prevBest = 0;
    if (zone.require_prev_best_floor > 0) {
      const earlier = zones
        .filter((z) => z.order_index < zone.order_index)
        .sort((a, b) => b.order_index - a.order_index);
      if (earlier.length > 0) {
        prevZone = earlier[0];
        prevBest = progressOf(progressByZone.get(Number(prevZone.id)) ?? null).bestFloor;
      }
    }
    const chainOk = zone.require_prev_best_floor <= 0 || prevBest >= zone.require_prev_best_floor;
    const reason: UnlockInfo['reason'] = !realmOk ? 'realm' : !chainOk ? 'prev' : 'ok';
    return { unlocked: realmOk && chainOk, reason, realmOk, chainOk, prevZone, prevBest };
  }

  private realmTooLow(zone: ZoneRow, realm: number) {
    return {
      success: false as const,
      message: '境界不足：' + zone.name + '需要 ' + zone.min_realm + ' 境',
      data: { code: 'REALM_TOO_LOW', required: zone.min_realm, current: realm },
    };
  }

  private zoneLocked(zone: ZoneRow, info: UnlockInfo) {
    return {
      success: false as const,
      message: '尚未解锁：' + zone.name,
      data: {
        code: 'ZONE_LOCKED',
        reason: 'prev',
        prevZone: info.prevZone ? info.prevZone.code : null,
        requiredPrevBestFloor: zone.require_prev_best_floor,
        prevBestFloor: info.prevBest,
      },
    };
  }

  /** 层深度派生：tierOffset 加成、额外掉落判定、是否 Boss 层 */
  private depth(zone: ZoneRow, floor: number) {
    const boss = isBossFloor(zone, floor);
    const tierOffset = tierOffsetBonusFor(zone, floor);
    const extraDraws = dropDrawBonusFor(zone, floor) + (boss ? APP_CONFIG.zoneBossExtraDraws : 0);
    return { boss, tierOffset, extraDraws };
  }

  /** 当前秘境 id：state 优先，否则取已解锁的最低 order 秘境（不落库） */
  private async currentZoneId(characterId: number, realm: number): Promise<number | null> {
    const state = await this.gameDb.query<ZoneStateRow>(
      'SELECT * FROM game_zone_state WHERE character_id = $1',
      [characterId],
    );
    if (state.rows[0]) return Number(state.rows[0].current_zone_id);
    const zones = await this.allZones();
    const rows = await this.progressRows(characterId);
    const map = this.progressMap(rows);
    const unlocked = zones.filter((z) => this.unlockInfo(z, realm, zones, map).unlocked);
    return unlocked.length > 0 ? Number(unlocked[0].id) : null;
  }

  /** 离线结算用：当前秘境当前层遭遇单位 */
  async encounterForCharacter(characterId: number, realm: number): Promise<ZoneEncounter | null> {
    const zoneId = await this.currentZoneId(characterId, realm);
    if (zoneId == null) return null;
    const zone = await this.zoneById(zoneId);
    if (!zone) return null;
    const progress = progressOf(await this.progressRow(characterId, zone.id));
    const boss = isBossFloor(zone, progress.floor);
    const unitCode = boss && zone.boss_code ? zone.boss_code : zone.unit_code;
    return { zoneCode: zone.code, zoneName: zone.name, floor: progress.floor, isBoss: boss, unitCode };
  }

  /**
   * 在线历练上下文（P3.0 T4）：当前秘境 + 层进度 + 战力 + 本层门槛 / 遭遇单位 / 层加成。
   *
   * 全部走既有派生函数（`floorRequirement` / `isBossFloor` / `tierOffsetBonusFor` /
   * `dropDrawBonusFor`），**不另写一套战力检定**。
   *
   * ⚠️ 与 `challenge` / `idle` 的一处刻意的差异：在线历练**只认 `zone.enter` 写入的当前秘境**
   * （`game_zone_state` 有行），**不使用 `currentZoneId` 的「已解锁最低 order 兜底」** ——
   * 否则一个从没进过任何秘境的角色会被自动算成「正在历练」，与「进入历练」的交互语义矛盾。
   * 没有当前秘境 → 返回 `null`（tick 不推进；面板给 reason='no_realm'）。
   */
  async onlineContext(characterId: number, realm: number): Promise<ZoneOnlineContext | null> {
    const state = await this.gameDb.query<ZoneStateRow>(
      'SELECT * FROM game_zone_state WHERE character_id = $1',
      [characterId],
    );
    const zoneId = state.rows[0]?.current_zone_id;
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
      maxFloor: Number(zone.max_floor),
      floor: progress.floor,
      bestFloor: progress.bestFloor,
      cleared: progress.cleared,
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
   * 在线历练的层推进落库（P3.0 T4）：与 `challenge` 同一张表、同一 `GREATEST` 口径。
   *
   * 差异只有一处（刻意）：**通关时不把 `floor` 写超过 `max_floor`** —— 在线面板要显示
   * 「第 3 / 3 层」，而 `challenge`（已降级为开发者工具，R2 §4.3）保留原行为写 floor+1。
   * `cleared` / `best_floor` 语义与 `challenge` 完全一致。
   *
   * @returns 落库后的 `{ floor, bestFloor, cleared }`
   */
  async advanceFloor(
    characterId: number,
    zoneId: number,
    input: { floor: number; bestFloor: number; maxFloor: number },
  ): Promise<{ floor: number; bestFloor: number; cleared: boolean }> {
    const nextFloor = input.floor + 1;
    const cleared = nextFloor > input.maxFloor;
    const storedFloor = cleared ? input.maxFloor : nextFloor;
    const nextBest = Math.max(input.bestFloor, input.floor);
    await this.gameDb.query(
      'INSERT INTO game_zone_progress (character_id, zone_id, floor, best_floor, cleared) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (character_id, zone_id) DO UPDATE SET floor = EXCLUDED.floor, best_floor = GREATEST(game_zone_progress.best_floor, EXCLUDED.best_floor), cleared = EXCLUDED.cleared, updated_at = CURRENT_TIMESTAMP',
      [characterId, zoneId, storedFloor, nextBest, cleared],
    );
    return { floor: storedFloor, bestFloor: nextBest, cleared };
  }

  async catalog(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const [zones, power, currentZoneId, progressRows] = await Promise.all([
      this.allZones(),
      this.playerPower(character.id, character.realm),
      this.currentZoneId(character.id, character.realm),
      this.progressRows(character.id),
    ]);
    const map = this.progressMap(progressRows);
    const views = zones.map((z) => {
      const info = this.unlockInfo(z, character.realm, zones, map);
      return {
        id: z.id,
        code: z.code,
        name: z.name,
        chapter: z.chapter,
        orderIndex: z.order_index,
        minRealm: z.min_realm,
        requirePrevBestFloor: z.require_prev_best_floor,
        unlocked: info.unlocked,
        unlockedReason: info.reason,
        prevZone: info.prevZone ? info.prevZone.code : null,
        prevBestFloor: info.prevBest,
        current: Number(z.id) === currentZoneId,
        unitCode: z.unit_code,
        bossCode: z.boss_code,
        basePower: z.base_power,
        powerStep: z.power_step,
        maxFloor: z.max_floor,
        lingyunBonusPerFloor: z.lingyun_bonus_per_floor,
        progress: progressOf(map.get(Number(z.id)) ?? null),
      };
    });
    const current = views.find((v) => v.current);
    return {
      success: true,
      message: '获取秘境图鉴成功',
      data: { total: views.length, playerPower: power, currentZone: current ? current.code : null, zones: views },
    };
  }

  async progress(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const zones = await this.allZones();
    const map = this.progressMap(await this.progressRows(character.id));
    const zoneId = await this.currentZoneId(character.id, character.realm);
    if (zoneId == null) return fail('ZONE_NOT_FOUND', '暂无可用秘境');
    const zone = zones.find((z) => Number(z.id) === zoneId) ?? null;
    if (!zone) return fail('ZONE_NOT_FOUND', '秘境不存在');
    const progress = progressOf(map.get(Number(zone.id)) ?? null);
    const power = await this.playerPower(character.id, character.realm);
    const req = floorRequirement(zone, progress.floor);
    const { boss, tierOffset, extraDraws } = this.depth(zone, progress.floor);
    const info = this.unlockInfo(zone, character.realm, zones, map);
    return {
      success: true,
      message: '获取秘境进度成功',
      data: {
        currentZone: { code: zone.code, name: zone.name, chapter: zone.chapter },
        floor: progress.floor,
        bestFloor: progress.bestFloor,
        cleared: progress.cleared,
        unlocked: info.unlocked,
        playerPower: power,
        floorRequirement: req,
        canChallenge: info.unlocked && !progress.cleared && power >= req,
        isBossFloor: boss,
        encounterUnit: boss && zone.boss_code ? zone.boss_code : zone.unit_code,
        lingyunBonus: progress.floor * zone.lingyun_bonus_per_floor,
        dropTierOffset: tierOffset,
        extraDropDraws: extraDraws,
      },
    };
  }

  async enter(userId: number, zoneCode: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const zone = await this.zoneByCode(zoneCode);
    if (!zone) return fail('ZONE_NOT_FOUND', '秘境不存在：' + zoneCode);
    const zones = await this.allZones();
    const map = this.progressMap(await this.progressRows(character.id));
    const info = this.unlockInfo(zone, character.realm, zones, map);
    if (!info.realmOk) return this.realmTooLow(zone, character.realm);
    if (!info.chainOk) return this.zoneLocked(zone, info);
    await this.gameDb.query(
      'INSERT INTO game_zone_state (character_id, current_zone_id, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (character_id) DO UPDATE SET current_zone_id = EXCLUDED.current_zone_id, updated_at = CURRENT_TIMESTAMP',
      [character.id, zone.id],
    );
    const progress = progressOf(await this.progressRow(character.id, zone.id));
    return {
      success: true,
      message: '已进入秘境：' + zone.name,
      data: {
        currentZone: { code: zone.code, name: zone.name, chapter: zone.chapter },
        floor: progress.floor,
        bestFloor: progress.bestFloor,
      },
    };
  }

  async challenge(userId: number, zoneCode?: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;

    const zones = await this.allZones();
    const map = this.progressMap(await this.progressRows(character.id));

    let zone: ZoneRow | null = null;
    if (zoneCode) {
      zone = zones.find((z) => z.code === zoneCode) ?? null;
      if (!zone) return fail('ZONE_NOT_FOUND', '秘境不存在：' + zoneCode);
    } else {
      const zoneId = await this.currentZoneId(character.id, character.realm);
      if (zoneId == null) return fail('ZONE_NOT_FOUND', '暂无可用秘境');
      zone = zones.find((z) => Number(z.id) === zoneId) ?? null;
    }
    if (!zone) return fail('ZONE_NOT_FOUND', '秘境不存在');

    const info = this.unlockInfo(zone, character.realm, zones, map);
    if (!info.realmOk) return this.realmTooLow(zone, character.realm);
    if (!info.chainOk) return this.zoneLocked(zone, info);

    const progress = progressOf(map.get(Number(zone.id)) ?? null);
    if (progress.cleared || progress.floor > zone.max_floor) {
      return {
        success: false,
        message: '该秘境已通关：' + zone.name,
        data: { code: 'ALREADY_CLEARED', zone: { code: zone.code, name: zone.name } },
      };
    }

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

    const nextFloor = progress.floor + 1;
    const nextBest = Math.max(progress.bestFloor, progress.floor);
    const cleared = nextFloor > zone.max_floor;
    await this.gameDb.query(
      'INSERT INTO game_zone_progress (character_id, zone_id, floor, best_floor, cleared) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (character_id, zone_id) DO UPDATE SET floor = EXCLUDED.floor, best_floor = GREATEST(game_zone_progress.best_floor, EXCLUDED.best_floor), cleared = EXCLUDED.cleared, updated_at = CURRENT_TIMESTAMP',
      [character.id, zone.id, nextFloor, nextBest, cleared],
    );

    // 地图层挂钩（settings-revision-2 §5.5 / D2）：本层是 Boss 层且挑战成功（= 击败该秘境
    // 第一个 Boss）或已通关时，通知 map 域把对应地图节点的 idle_unlocked 置位。
    // 层数判定留在 zone 域（isBossFloor / max_floor），map 域只负责置位，不重复实现层数逻辑；
    // 没有地图节点的遗留秘境（zone_qingyun 等 5 个）在 map 域内直接被忽略，行为不变。
    await this.mapLogic.onZoneFloorPassed(character.id, {
      zoneCode: zone.code,
      floor: progress.floor,
      isBossFloor: boss,
      cleared,
    });

    return {
      success: true,
      message: '挑战成功：' + zone.name + ' 第' + progress.floor + '层',
      data: {
        zone: { code: zone.code, name: zone.name },
        floor: progress.floor,
        nextFloor,
        bestFloor: nextBest,
        cleared,
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
