/**
 * 地图服务（settings-revision-2 §5 / §6 / §7）
 *
 * 职责（本轮的实现边界）：
 * - `panel`：下发该角色**已发现**的地图线路图（节点 + 边 + 进度），未发现节点不下发（§5.2）；
 * - `enter`：跑图移动，确定性战力检定（`playerPower ≥ node.threshold`，§6.2），
 *   首次到达写 `visited`，带传送点的节点同时点亮 `waypoint_unlocked`（§5.2）；幂等；
 * - `waypoint`：直达任意 `waypoint_unlocked = true` 的节点（§5.2）；
 * - `onZoneFloorPassed`：zone 域层数推进到 Boss 层时置位秘境的 `idle_unlocked`（§5.5 / D2）；
 * - `zoneIdleGate`：idle 域离线结算前的闸门判定（未解锁的秘境不得离线挂机，§2 第 2 步）。
 *
 * **不负责**：秘境内部层数与产出（zone 域）、秘境挂机每小时产出结算（idle 域）、
 * 「承载系统是否已实现」（客户端 registry）、地图的剧情解锁（章节域，未接线）。
 *
 * ⚠️ 设计修正（用户定调，见设计追踪修订 `052b146`）：**挂机只能在秘境峰** ——
 * 地图上不再散布独立挂机节点，全图唯一的离线挂机处就是 `secret_realm` 节点
 * （青云宗 = 后山峰）。因此本域只处理 `route` / `secret_realm` / `summit` 三类节点，
 * `level` 仅作「怪物境界」展示，门槛判定只用 `threshold`。
 *
 * 战力复用 `character/player-power.service.ts`（与 zone 域同一实现），不在此另算一份。
 */
import { Injectable } from '@nestjs/common';
import { CharacterService } from '../../../character/character.service.js';
import { PlayerPowerService } from '../../../character/player-power.service.js';
import { GameDatabaseService } from '../../../game/game-database.service.js';
import type {
  ZoneFloorAdvancedEvent,
  ZoneIdleGate,
  ZoneIdleUnlockResult,
} from '../map.api.js';
import {
  type FailResult,
  type MapEdgeRow,
  type MapNodeRow,
  type MapRow,
  type NodeProgressRow,
  type NodeProgressView,
  discoveredCodes,
  unlockedMapCodes,
  fail,
  progressView,
} from './map.types.js';

/** 统一的 Action 结果体形状（与 zone 域一致，由骨架包进响应信封） */
export interface MapActionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

@Injectable()
export class MapService {
  constructor(
    private readonly gameDb: GameDatabaseService,
    private readonly characterService: CharacterService,
    private readonly playerPowerService: PlayerPowerService,
  ) {}

  private async resolveCharacter(userId: number) {
    const character = await this.characterService.findByUserId(userId);
    if (!character) return { error: fail('CHARACTER_NOT_FOUND', '尚未创建角色') as FailResult };
    return { character };
  }

  private async allMaps(): Promise<MapRow[]> {
    const rows = await this.gameDb.query<MapRow>('SELECT * FROM game_maps ORDER BY order_index, id');
    return rows.rows;
  }

  private async allNodes(): Promise<MapNodeRow[]> {
    const rows = await this.gameDb.query<MapNodeRow>(
      'SELECT * FROM game_map_nodes ORDER BY map_id, order_index, id',
    );
    return rows.rows;
  }

  private async allEdges(): Promise<MapEdgeRow[]> {
    const rows = await this.gameDb.query<MapEdgeRow>('SELECT * FROM game_map_edges ORDER BY map_id, id');
    return rows.rows;
  }

  /**
   * 该角色**已完成**的章节序号 —— D4「章节完成即解锁下一张地图」的判定依据。
   *
   * 只取 `status='completed'`（与 `chapter.service.ts:88` 同口径），
   * 规则本身在 `unlockedMapCodes`（纯函数，可不连库单测）。
   */
  private async completedChapters(characterId: number): Promise<Set<number>> {
    const rows = await this.gameDb.query<{ chapter: number }>(
      `SELECT c.chapter FROM game_chapter_progress p
         JOIN game_chapters c ON c.id = p.chapter_id
        WHERE p.character_id = $1 AND p.status = 'completed'`,
      [characterId],
    );
    return new Set(rows.rows.map((r) => Number(r.chapter)));
  }

  private async progressRows(characterId: number): Promise<NodeProgressRow[]> {
    const rows = await this.gameDb.query<NodeProgressRow>(
      'SELECT * FROM game_node_progress WHERE character_id = $1',
      [characterId],
    );
    return rows.rows;
  }

  private progressMap(rows: NodeProgressRow[]): Map<number, NodeProgressRow> {
    return new Map(rows.map((r) => [Number(r.node_id), r]));
  }

  private async nodeByCode(code: string): Promise<MapNodeRow | null> {
    const rows = await this.gameDb.query<MapNodeRow>('SELECT * FROM game_map_nodes WHERE code = $1', [code]);
    return rows.rows[0] ?? null;
  }

  /** 秘境节点：只认 kind=secret_realm 且 zone_code 命中的节点（§5.3） */
  private async secretRealmNodeByZoneCode(zoneCode: string): Promise<MapNodeRow | null> {
    const rows = await this.gameDb.query<MapNodeRow>(
      "SELECT * FROM game_map_nodes WHERE zone_code = $1 AND kind = 'secret_realm' ORDER BY id",
      [zoneCode],
    );
    return rows.rows[0] ?? null;
  }

  private async progressRow(characterId: number, nodeId: number): Promise<NodeProgressRow | null> {
    const rows = await this.gameDb.query<NodeProgressRow>(
      'SELECT * FROM game_node_progress WHERE character_id = $1 AND node_id = $2',
      [characterId, nodeId],
    );
    return rows.rows[0] ?? null;
  }

  /** 节点视图（协议 dto.ts 的 `MapNodeView`） */
  private nodeView(node: MapNodeRow, progress: NodeProgressView) {
    return {
      id: Number(node.id),
      code: node.code,
      name: node.name,
      ring: node.ring,
      sector: node.sector,
      kind: node.kind,
      featureKey: node.feature_key,
      level: Number(node.level),
      threshold: Number(node.threshold),
      hasWaypoint: Boolean(node.has_waypoint),
      chapter: Number(node.chapter),
      requiresNodeCode: node.requires_node_code,
      zoneCode: node.zone_code,
      orderIndex: Number(node.order_index),
      progress,
    };
  }

  private nodeNotFound(nodeCode: string): MapActionResult {
    return {
      success: false,
      message: '节点不存在：' + nodeCode,
      data: { code: 'NODE_NOT_FOUND', nodeCode },
    };
  }

  /** 地图列表：只下发已发现节点，以及两端均已发现的边（§5.2） */
  async panel(userId: number): Promise<MapActionResult> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const [maps, nodes, edges, progressRows, power, completed] = await Promise.all([
      this.allMaps(),
      this.allNodes(),
      this.allEdges(),
      this.progressRows(character.id),
      this.playerPowerService.compute(character.id, character.realm),
      this.completedChapters(character.id),
    ]);
    const byNodeId = this.progressMap(progressRows);
    const discovered = discoveredCodes(nodes, byNodeId);
    const codeById = new Map(nodes.map((n) => [Number(n.id), n.code]));
    // D4：只下发**已解锁**的地图 —— 未解锁的世界连轮廓都不出现（与「未发现节点不下发」同口径）
    const unlocked = unlockedMapCodes(maps, completed);
    const views = maps.filter((map) => unlocked.has(map.code)).map((map) => {
      const visible = nodes.filter(
        (n) => Number(n.map_id) === Number(map.id) && discovered.has(n.code),
      );
      const visibleCodes = new Set(visible.map((n) => n.code));
      const mapEdges = edges
        .filter((e) => Number(e.map_id) === Number(map.id))
        .map((e) => ({
          from: codeById.get(Number(e.from_node_id)) ?? null,
          to: codeById.get(Number(e.to_node_id)) ?? null,
          bidirectional: Boolean(e.bidirectional),
        }))
        // 只保留两端都已发现的边：未发现节点不出现，也不泄露它的邻接关系
        .filter((e) => e.from != null && e.to != null && visibleCodes.has(e.from) && visibleCodes.has(e.to))
        .map((e) => ({ fromNodeCode: e.from as string, toNodeCode: e.to as string, bidirectional: e.bidirectional }));
      return {
        id: Number(map.id),
        code: map.code,
        name: map.name,
        world: map.world,
        orderIndex: Number(map.order_index),
        chapterFrom: Number(map.chapter_from),
        chapterTo: Number(map.chapter_to),
        requiresMapCode: map.requires_map_code,
        description: map.description,
        nodes: visible.map((n) => this.nodeView(n, progressView(byNodeId.get(Number(n.id))))),
        edges: mapEdges,
      };
    });
    return {
      success: true,
      message: '获取地图成功',
      data: { total: views.length, playerPower: power, maps: views },
    };
  }

  /**
   * 跑图：移动到目标节点。
   *
   * 顺序（§5.2 + §6.2）：节点存在 → 已发现（否则 NODE_LOCKED）→ 战力达标（否则
   * NODE_POWER_NOT_ENOUGH；恰好等于门槛视为通过）→ 首次到达写进度。
   * 幂等：已 `visited` 且传送点状态一致时不产生任何写库。
   */
  async enter(userId: number, nodeCode: string): Promise<MapActionResult> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const node = await this.nodeByCode(nodeCode);
    if (!node) return this.nodeNotFound(nodeCode);

    const [nodes, progressRows] = await Promise.all([this.allNodes(), this.progressRows(character.id)]);
    const byNodeId = this.progressMap(progressRows);
    const discovered = discoveredCodes(nodes, byNodeId);
    if (!discovered.has(node.code)) {
      return {
        success: false,
        message: '节点尚未发现：' + node.name,
        data: { code: 'NODE_LOCKED', nodeCode: node.code, requiresNodeCode: node.requires_node_code },
      };
    }

    const power = await this.playerPowerService.compute(character.id, character.realm);
    const threshold = Number(node.threshold);
    if (power < threshold) {
      return {
        success: false,
        message: '战力不足：' + node.name + '（' + power + ' < ' + threshold + '）',
        data: { code: 'NODE_POWER_NOT_ENOUGH', nodeCode: node.code, playerPower: power, threshold },
      };
    }

    const existing = byNodeId.get(Number(node.id)) ?? null;
    const alreadyVisited = Boolean(existing?.visited);
    const waypointOpen = Boolean(existing?.waypoint_unlocked) || Boolean(node.has_waypoint);
    // 首次到达（visit=false）或传送点待补齐时才写库：重复 enter 无副作用
    const needWrite = !alreadyVisited || waypointOpen !== Boolean(existing?.waypoint_unlocked);
    if (needWrite) {
      await this.gameDb.query(
        `INSERT INTO game_node_progress (character_id, node_id, visited, waypoint_unlocked, idle_unlocked, cleared)
         VALUES ($1, $2, TRUE, $3, FALSE, FALSE)
         ON CONFLICT (character_id, node_id)
         DO UPDATE SET visited = TRUE,
                       waypoint_unlocked = game_node_progress.waypoint_unlocked OR EXCLUDED.waypoint_unlocked,
                       updated_at = CURRENT_TIMESTAMP`,
        [character.id, node.id, Boolean(node.has_waypoint)],
      );
    }
    const progress: NodeProgressView = {
      visited: true,
      waypointUnlocked: waypointOpen,
      idleUnlocked: Boolean(existing?.idle_unlocked),
      cleared: Boolean(existing?.cleared),
    };
    return {
      success: true,
      message: '已到达：' + node.name,
      data: {
        node: this.nodeView(node, progress),
        playerPower: power,
        threshold,
        firstVisit: !alreadyVisited,
      },
    };
  }

  /**
   * 传送：直达已点亮传送点的节点（§5.2）。
   *
   * `NODE_NOT_VISITED`（从未到达过）与 `WAYPOINT_NOT_UNLOCKED`（到达过但传送点未点亮 /
   * 该节点本身没有传送点）分开报，便于 UI 给出不同提示。
   */
  async waypoint(userId: number, nodeCode: string): Promise<MapActionResult> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const node = await this.nodeByCode(nodeCode);
    if (!node) return this.nodeNotFound(nodeCode);

    const progress = progressView(await this.progressRow(character.id, Number(node.id)));
    if (!progress.visited) {
      return {
        success: false,
        message: '尚未到达过：' + node.name,
        data: { code: 'NODE_NOT_VISITED', nodeCode: node.code },
      };
    }
    if (!node.has_waypoint || !progress.waypointUnlocked) {
      return {
        success: false,
        message: '传送点未点亮：' + node.name,
        data: { code: 'WAYPOINT_NOT_UNLOCKED', nodeCode: node.code, hasWaypoint: Boolean(node.has_waypoint) },
      };
    }
    return {
      success: true,
      message: '已传送至：' + node.name,
      data: { node: this.nodeView(node, progress) },
    };
  }

  /**
   * zone 域层数推进挂钩：Boss 层通过 / 通关 → 置位该秘境节点的 `idle_unlocked`（§5.5 / D2）。
   *
   * 层数是否到达 Boss 由 zone 域判定后随事件传入，本方法只做置位。
   * **幂等**：已置位则直接返回，不重复写库（故 `changed` 只在第一次为 true）。
   * 没有地图节点的遗留秘境（`zone_qingyun` 等 5 个）返回 `no_map_node`，不产生任何写入。
   */
  async onZoneFloorPassed(
    characterId: number,
    event: ZoneFloorAdvancedEvent,
  ): Promise<ZoneIdleUnlockResult> {
    if (!event.isBossFloor && !event.cleared) {
      return { changed: false, nodeCode: null, reason: 'not_boss' };
    }
    const node = await this.secretRealmNodeByZoneCode(event.zoneCode);
    if (!node) return { changed: false, nodeCode: null, reason: 'no_map_node' };

    const existing = await this.progressRow(characterId, Number(node.id));
    if (existing?.idle_unlocked) {
      return { changed: false, nodeCode: node.code, reason: 'already_unlocked' };
    }
    await this.gameDb.query(
      `INSERT INTO game_node_progress (character_id, node_id, visited, waypoint_unlocked, idle_unlocked, cleared)
       VALUES ($1, $2, FALSE, FALSE, TRUE, $3)
       ON CONFLICT (character_id, node_id)
       DO UPDATE SET idle_unlocked = TRUE,
                     cleared = game_node_progress.cleared OR EXCLUDED.cleared,
                     updated_at = CURRENT_TIMESTAMP`,
      [characterId, node.id, Boolean(event.cleared)],
    );
    return { changed: true, nodeCode: node.code, reason: 'unlocked' };
  }

  /**
   * 离线挂机闸门（§2 第 2 步 / R2-3）。
   *
   * **过渡规则**：只有挂在某个地图节点上的秘境才受闸门约束。5 个遗留秘境
   * （`zone_qingyun` / `zone_miwu` / `zone_guhai` / `zone_dajie` / `zone_hundun`）
   * 在 `game_map_nodes` 里没有对应节点，返回 `enforced = false`，其离线结算行为保持不变。
   *
   * 退场条件：等地图形 2/3 定义完、这批遗留秘境被重新归属到地图节点之后，删掉这里的
   * `enforced` 分支（闸门对所有秘境一律生效）。迁移债由
   * `packages/server/test/modules/map-seed.test.ts` 的「未归属任何地图节点的遗留秘境」
   * 用例守着 —— 该用例失败即表示可以删除过渡分支。
   */
  async zoneIdleGate(characterId: number, zoneCode: string): Promise<ZoneIdleGate> {
    const node = await this.secretRealmNodeByZoneCode(zoneCode);
    if (!node) {
      return { enforced: false, unlocked: false, nodeCode: null, nodeName: null };
    }
    const progress = progressView(await this.progressRow(characterId, Number(node.id)));
    return {
      enforced: true,
      unlocked: progress.idleUnlocked,
      nodeCode: node.code,
      nodeName: node.name,
    };
  }
}
