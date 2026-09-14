/**
 * 地图服务（settings-revision-2 §5 / §6 / §7；§22 修订）
 *
 * 职责（本轮的实现边界）：
 * - `panel`：下发该角色**已发现**的地图线路图（节点 + 边 + 进度），未发现节点不下发（§5.2）；
 * - `enter`：跑图移动，确定性战力检定（`playerPower ≥ node.threshold`，§6.2），
 *   首次到达写 `visited`，带传送点的节点同时点亮 `waypoint_unlocked`（§5.2）；幂等；
 * - `waypoint`：直达任意 `waypoint_unlocked = true` 的节点（§5.2）。
 *
 * **不负责**：秘境（§22 起与地图**彻底解耦** —— 突破/解锁/挂机全在 zone 域，
 * `onZoneFloorPassed` / `zoneIdleGate` / `secretRealmNodeView` 三个跨域钩子已删除）、
 * 「承载系统是否已实现」（客户端 registry）、地图的剧情解锁（章节域，未接线）。
 *
 * ⚠️ §22 数据分层反转：`level`（怪物境界）/ `threshold`（门槛）/ `zone_code`
 * **不再有任何非空值** —— 秘境搬进 `game_zones` 后，宗门里的 17 个枢纽都是
 * 职能型地点（没有怪物）。
 *
 * 战力复用 `character/player-power.service.ts`（与 zone 域同一实现），不在此另算一份。
 */
import { Injectable } from '@nestjs/common';
import { CharacterService } from '../../../character/character.service.js';
import { PlayerPowerService } from '../../../character/player-power.service.js';
import { GameDatabaseService } from '../../../game/game-database.service.js';
import {
  type FailResult,
  type MapEdgeRow,
  type MapNodeRow,
  type MapObjectRow,
  type MapRow,
  type MapStateRow,
  type NodeProgressRow,
  type NodeProgressView,
  discoveredCodes,
  objectView,
  optionalInt,
  unlockedMapCodes,
  fail,
  progressView,
  safeInt,
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

  /** 对象层（P2.0 §3）：一院多职能的明细，按宿主枢纽分组下发。 */
  private async allObjects(): Promise<MapObjectRow[]> {
    const rows = await this.gameDb.query<MapObjectRow>(
      'SELECT * FROM game_map_objects ORDER BY map_id, node_code, order_index, id',
    );
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

  private async progressRow(characterId: number, nodeId: number): Promise<NodeProgressRow | null> {
    const rows = await this.gameDb.query<NodeProgressRow>(
      'SELECT * FROM game_node_progress WHERE character_id = $1 AND node_id = $2',
      [characterId, nodeId],
    );
    return rows.rows[0] ?? null;
  }

  /**
   * 当前所在节点 id（P2.0 §5）。
   *
   * 无行 = 新角色 → `null`；`current_node_id` 指向**已删节点**（配置漂移）时也返回 null，
   * 由「入口规则」兜底（四门可进），而不是崩。
   */
  private async currentNodeId(characterId: number): Promise<number | null> {
    const rows = await this.gameDb.query<MapStateRow>(
      'SELECT current_node_id FROM game_map_state WHERE character_id = $1',
      [characterId],
    );
    const raw = rows.rows[0]?.current_node_id ?? null;
    if (raw == null) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  }

  /** 写当前所在（幂等 upsert；`map.enter` / `map.waypoint` 成功后调用）。 */
  private async setCurrentNodeId(characterId: number, nodeId: number): Promise<void> {
    await this.gameDb.query(
      `INSERT INTO game_map_state (character_id, current_node_id)
       VALUES ($1, $2)
       ON CONFLICT (character_id)
       DO UPDATE SET current_node_id = EXCLUDED.current_node_id, updated_at = CURRENT_TIMESTAMP`,
      [characterId, nodeId],
    );
  }

  /**
   * 是否山门（入口）：`ring = 'outer'` 的四门。
   * 山门**始终**放行 —— 新角色由此入图，`current_node_id` 漂移到已删节点时也由此兜底。
   */
  private isGate(node: MapNodeRow): boolean {
    return node.ring === 'outer';
  }

  /** 与 `nodeId` 相邻的节点 id 集合（双向边对称；单向边只认 from → to）。 */
  private adjacentNodeIds(edges: readonly MapEdgeRow[], nodeId: number): Set<number> {
    const adjacent = new Set<number>();
    for (const edge of edges) {
      const from = Number(edge.from_node_id);
      const to = Number(edge.to_node_id);
      if (from === nodeId) adjacent.add(to);
      else if (Boolean(edge.bidirectional) && to === nodeId) adjacent.add(from);
    }
    return adjacent;
  }

  /**
   * 节点视图（协议 dto.ts 的 `MapNodeView`）。
   *
   * `adjacent`（P2.0 §5/T7）：该节点与角色**当前所在**是否有边。服务端判定（拓扑权威），
   * 前端只消费；`current_node_id` 为空 / 指向已删节点时全部为 false。
   */
  private nodeView(node: MapNodeRow, progress: NodeProgressView, adjacent = false) {
    return {
      id: Number(node.id),
      code: node.code,
      name: node.name,
      ring: node.ring,
      sector: node.sector,
      kind: node.kind,
      featureKey: node.feature_key,
      // 数据分层（T1）：只有秘境节点带怪物数据；职能型枢纽为 null（不得用 Number() 变 0）
      level: optionalInt(node.level),
      threshold: optionalInt(node.threshold),
      hasWaypoint: Boolean(node.has_waypoint),
      chapter: Number(node.chapter),
      requiresNodeCode: node.requires_node_code,
      zoneCode: node.zone_code,
      orderIndex: Number(node.order_index),
      // P1 画布坐标：0-based 交叉线索引。漏改 SELECT 时这里是 undefined，
      // safeInt 把它收敛成 0 而不是 NaN（NaN 会被 JSON 序列化成 null 静默进协议）。
      gridRow: safeInt(node.grid_row, 0),
      gridCol: safeInt(node.grid_col, 0),
      description: node.description ?? null,
      adjacent,
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
    const [maps, nodes, edges, objects, progressRows, power, completed, currentId] = await Promise.all([
      this.allMaps(),
      this.allNodes(),
      this.allEdges(),
      this.allObjects(),
      this.progressRows(character.id),
      this.playerPowerService.compute(character.id, character.realm),
      this.completedChapters(character.id),
      this.currentNodeId(character.id),
    ]);
    const byNodeId = this.progressMap(progressRows);
    const discovered = discoveredCodes(nodes, byNodeId);
    const codeById = new Map(nodes.map((n) => [Number(n.id), n.code]));
    // D4：只下发**已解锁**的地图 —— 未解锁的世界连轮廓都不出现（与「未发现节点不下发」同口径）
    const unlocked = unlockedMapCodes(maps, completed);
    const views = maps.filter((map) => unlocked.has(map.code)).map((map) => {
      const mapNodeRows = nodes.filter((n) => Number(n.map_id) === Number(map.id));
      const visible = mapNodeRows.filter((n) => discovered.has(n.code));
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
      // P2.0 §5：当前所在 + 相邻集合（都基于拓扑，服务端判定）。
      // `current_node_id` 指向**已删节点**或属于别的地图 → 本图 currentNodeCode = null（不崩）。
      const inThisMap = currentId != null && mapNodeRows.some((n) => Number(n.id) === currentId);
      const currentNodeCode = inThisMap ? (codeById.get(currentId as number) ?? null) : null;
      const adjacentIds =
        currentId == null
          ? new Set<number>()
          : this.adjacentNodeIds(
              edges.filter((e) => Number(e.map_id) === Number(map.id)),
              currentId,
            );
      // 山门**恒为相邻**（入口规则，与 `enter` 的 `isGate` 放行一致）：
      // 新角色 `current_node_id = null` 时恰好 4 个 `adjacent = true`（四门），
      // 否则第一个节点就进不去 —— 这是不死锁的关键。
      const isEnterable = (n: MapNodeRow) => this.isGate(n) || adjacentIds.has(Number(n.id));
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
        // 坐标空间：至少 1 行 1 列，否则前端把画布算成 0×0 宽高（除零 / 空白画布）
        gridRows: Math.max(1, safeInt(map.grid_rows, 1)),
        gridCols: Math.max(1, safeInt(map.grid_cols, 1)),
        backgroundKey: map.background_key ?? null,
        currentNodeCode,
        nodes: visible.map((n) =>
          this.nodeView(n, progressView(byNodeId.get(Number(n.id))), isEnterable(n)),
        ),
        edges: mapEdges,
        // 对象层（P2.0 §3）：一院多职能的明细，**全量下发**（对象不是探索内容），
        // 前端按宿主枢纽 `nodeCode` 过滤后列在右栏。
        objects: objects
          .filter((o) => Number(o.map_id) === Number(map.id))
          .map((o) => objectView(o)),
      };
    });
    return {
      success: true,
      message: '获取地图成功',
      data: { total: views.length, playerPower: power, maps: views },
    };
  }

  /**
   * 跑图：移动到目标节点（P2.0 v3 §5：**仅看相邻，无战力限制**）。
   *
   * 顺序：节点存在 → **相邻闸门**（非山门且与当前所在地不相邻 → `NODE_NOT_ADJACENT`）
   * → 写进度 + 当前所在。
   *
   * **相邻 = `game_map_edges` 有边**（拓扑权威，服务端判定）。客户端闸门等于没有，
   * 所以这条必须在服务端。
   *
   * **战力限制已删除**（用户 2026-09-14：「前往以当前相邻，但是需要删除战力限制」）：
   * `threshold` 保留为展示 / 后续战斗难度参考，但**不再拦截前往**，
   * 本方法也**不再返回 `NODE_POWER_NOT_ENOUGH`**。
   *
   * **入口规则**：`current_node_id = null`（新角色）时只有四门可进；四门也**始终**放行
   * （「非相邻且非山门」才拒绝），这样即使 `current_node_id` 指向已删节点（配置漂移）
   * 也只是退化为「只有四门可进」，而不是把角色永久锁死。
   *
   * ⚠️ `requires_node_code` 本轮**不再作为进入闸门**（字段保留，仍随 DTO 下发）。
   * 幂等：已 `visited` 且传送点状态一致时不产生进度写库（当前所在仍幂等 upsert）。
   */
  async enter(userId: number, nodeCode: string): Promise<MapActionResult> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const node = await this.nodeByCode(nodeCode);
    if (!node) return this.nodeNotFound(nodeCode);

    if (!this.isGate(node)) {
      const [currentId, allEdges] = await Promise.all([
        this.currentNodeId(character.id),
        this.allEdges(),
      ]);
      const adjacent =
        currentId !== null && this.adjacentNodeIds(allEdges, currentId).has(Number(node.id));
      if (!adjacent) {
        return {
          success: false,
          message: '与当前所在地不相邻：' + node.name,
          data: { code: 'NODE_NOT_ADJACENT', nodeCode: node.code },
        };
      }
    }

    // 战力不再参与闸门，但仍在响应里回显（展示用；`threshold` 降级为难度参考，
    // 且**只有秘境节点才有值**：职能型枢纽回显 null，前端据此不显示战斗数据块）
    const power = await this.playerPowerService.compute(character.id, character.realm);
    const threshold = optionalInt(node.threshold);
    const existing = await this.progressRow(character.id, Number(node.id));
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
    // P2.0 §5：到达即更新「当前所在」——与进度写库分开，重复 enter 也要把位置落库（幂等 upsert）。
    await this.setCurrentNodeId(character.id, Number(node.id));
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
    // P2.0 §5：传送成功后同样更新「当前所在」。语义不变：仍要求传送点已点亮。
    await this.setCurrentNodeId(character.id, Number(node.id));
    return {
      success: true,
      message: '已传送至：' + node.name,
      data: { node: this.nodeView(node, progress) },
    };
  }
}
