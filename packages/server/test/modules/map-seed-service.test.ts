/**
 * 地图种子 × MapService **集成**测试（P2.0 §7 的实测口径）。
 *
 * 纯种子 lint 在 `map-seed.test.ts`，服务边界在 `map.service.test.ts`；本文件把两者接起来：
 * 用**真实种子 JSON** 灌进假库，跑 `panel` / `enter` / `waypoint`，验证
 * 「17 枢纽 / 4 个初始可前往（四门）/ 11 个对象 / 相邻闸门 / 传送点」这些只有真种子才成立的性质。
 *
 * 为什么值得单独一个文件：假库里的合成 fixture 很容易「自洽但不对」，而 §7 的验收数字
 * （17 / 4 / 11 / 32）是**内容约束** —— 必须对着种子跑一遍。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MapService } from '../../src/modules/logic/map/internal/map.service.js';
import { PlayerPowerService } from '../../src/modules/character/player-power.service.js';
import { FakeDatabase } from '../helpers/fake-db.js';
import { stub } from '../helpers/stub.js';
import type { Character } from '../../src/modules/character/character.service.js';

const SEED_DIR = new URL('../../prisma/seeds/game/', import.meta.url);
const read = <T>(file: string): T => JSON.parse(readFileSync(new URL(file, SEED_DIR), 'utf8')) as T;

interface SeedMap { id: number; code: string; name: string; world?: string; orderIndex: number; chapterFrom: number; chapterTo: number; requiresMapCode?: string | null; description?: string | null; gridRows?: number; gridCols?: number; backgroundKey?: string | null }
interface SeedNode {
  code: string; mapCode: string; name: string; ring: string; sector?: string | null; kind: string;
  featureKey?: string | null; level: number | null; threshold: number | null; hasWaypoint?: boolean; chapter: number;
  requiresNodeCode?: string | null; zoneCode?: string | null; orderIndex: number; gridRow: number; gridCol: number; description?: string | null;
}
interface SeedEdge { id: number; mapCode: string; fromNodeCode: string; toNodeCode: string; bidirectional?: boolean }
interface SeedObject { code: string; mapCode: string; nodeCode: string; kind: string; name: string; featureKey?: string | null; description?: string | null; orderIndex: number }

const seedMaps = read<SeedMap[]>('maps.json');
const seedNodes = read<SeedNode[]>('map-nodes.json');
const seedEdges = read<SeedEdge[]>('map-edges.json');
const seedObjects = read<SeedObject[]>('map-objects.json');

const nodeId = new Map(seedNodes.map((n, i) => [n.code, i + 1]));
const idNode = new Map([...nodeId].map(([code, id]) => [id, code]));

const mapRows = seedMaps.map((m, i) => ({
  id: i + 1, code: m.code, name: m.name, world: m.world ?? 'great', order_index: m.orderIndex,
  chapter_from: m.chapterFrom, chapter_to: m.chapterTo, requires_map_code: m.requiresMapCode ?? null,
  description: m.description ?? null, grid_rows: m.gridRows ?? 20, grid_cols: m.gridCols ?? 20,
  background_key: m.backgroundKey ?? null,
}));
const nodeRows = seedNodes.map((n) => ({
  id: nodeId.get(n.code), code: n.code, map_id: 1, name: n.name, ring: n.ring, sector: n.sector ?? null,
  kind: n.kind, feature_key: n.featureKey ?? null, level: n.level, threshold: n.threshold,
  has_waypoint: n.hasWaypoint ?? false, chapter: n.chapter, requires_node_code: n.requiresNodeCode ?? null,
  zone_code: n.zoneCode ?? null, order_index: n.orderIndex, grid_row: n.gridRow, grid_col: n.gridCol,
  description: n.description ?? null,
}));
const edgeRows = seedEdges.map((e, i) => ({
  id: i + 1, map_id: 1, from_node_id: nodeId.get(e.fromNodeCode), to_node_id: nodeId.get(e.toNodeCode),
  bidirectional: e.bidirectional ?? true,
}));
const objectRows = seedObjects.map((o, i) => ({
  id: i + 1, code: o.code, map_id: 1, node_code: o.nodeCode, kind: o.kind, name: o.name,
  feature_key: o.featureKey ?? null, description: o.description ?? null, order_index: o.orderIndex,
}));

/** 真种子的假库：progress / state 的写入改内存，用于验证后续 panel。 */
function seedDb() {
  const progress: Array<Record<string, unknown>> = [];
  const state: Array<Record<string, unknown>> = [];
  const findProgress = (charId: unknown, nodeIdValue: unknown) =>
    progress.find((p) => p.character_id === charId && p.node_id === nodeIdValue);
  const db = new FakeDatabase()
    .on(/FROM game_maps ORDER BY order_index, id/, { rows: mapRows })
    .on(/FROM game_map_nodes ORDER BY map_id, order_index, id/, { rows: nodeRows })
    .on(/FROM game_map_edges ORDER BY map_id, id/, { rows: edgeRows })
    .on(/FROM game_map_objects ORDER BY map_id, node_code, order_index, id/, { rows: objectRows })
    .on(/FROM game_map_nodes WHERE code = \$1/, (params) => ({ rows: nodeRows.filter((n) => n.code === params[0]) }))
    .on(/FROM game_node_progress WHERE character_id = \$1$/, (params) => ({ rows: progress.filter((p) => p.character_id === params[0]) }))
    .on(/FROM game_node_progress WHERE character_id = \$1 AND node_id = \$2/, (params) => ({ rows: progress.filter((p) => p.character_id === params[0] && p.node_id === params[1]) }))
    .on(/INSERT INTO game_node_progress/, (params, sql) => {
      const [charId, nodeIdValue] = params as [number, number, unknown];
      let row = findProgress(charId, nodeIdValue);
      if (!row) {
        row = { id: progress.length + 1, character_id: charId, node_id: nodeIdValue, visited: false, waypoint_unlocked: false, idle_unlocked: false, cleared: false };
        progress.push(row);
      }
      if (sql.includes('waypoint_unlocked = game_node_progress')) {
        row.visited = true;
        row.waypoint_unlocked = Boolean(row.waypoint_unlocked) || Boolean(params[2]);
      } else {
        row.idle_unlocked = true;
      }
      return { rows: [row] };
    })
    .on(/FROM game_map_state WHERE character_id = \$1/, (params) => ({ rows: state.filter((s) => s.character_id === params[0]) }))
    .on(/INSERT INTO game_map_state/, (params) => {
      const [charId, nodeIdValue] = params as [number, number];
      let row = state.find((s) => s.character_id === charId);
      if (!row) {
        row = { character_id: charId, current_node_id: nodeIdValue };
        state.push(row);
      } else {
        row.current_node_id = nodeIdValue;
      }
      return { rows: [row] };
    })
    .on(/FROM game_chapter_progress p/, { rows: [] });
  return { db, progress, state };
}

function makeChar(realm = 1): Character {
  return { id: 11, userId: 7, nickname: '道友', gender: 'male', title: null, spiritStones: 0, silver: 0, realm, lingyun: 0, jadeSlips: 0 };
}

function makeService(db: FakeDatabase, realm = 1) {
  const charStub = { findByUserId: stub(async () => makeChar(realm)) };
  const power = new PlayerPowerService(db as never);
  return new MapService(db as never, charStub as never, power as never);
}

interface PanelNode { code: string; ring: string; adjacent: boolean; gridRow: number; gridCol: number; level: number | null; threshold: number | null }
interface PanelObject { code: string; nodeCode: string; featureKey: string | null; kind: string }
interface PanelView { code: string; gridRows: number; gridCols: number; currentNodeCode: string | null; nodes: PanelNode[]; edges: unknown[]; objects: PanelObject[] }

async function panelView(db: FakeDatabase): Promise<PanelView> {
  const res = await makeService(db).panel(7);
  assert.equal(res.success, true);
  return (res.data as { maps: PanelView[] }).maps[0];
}

describe('地图种子 × MapService 集成（P2.0 §7）', () => {
  test('新角色 panel：17 个节点、恰好 4 个 adjacent（四门）、currentNodeCode=null', async () => {
    const { db } = seedDb();
    const view = await panelView(db);
    assert.equal(view.gridRows, 20);
    assert.equal(view.gridCols, 20);
    assert.equal(view.currentNodeCode, null);
    assert.equal(view.nodes.length, 17);
    const adjacent = view.nodes.filter((n) => n.adjacent).map((n) => n.code).sort();
    assert.deepStrictEqual(adjacent, ['qy_gate_e', 'qy_gate_n', 'qy_gate_s', 'qy_gate_w']);
  });

  test('数据分层（T1）：真种子下发后只有历练峰带 level/threshold，其余 16 个为 null', async () => {
    const { db } = seedDb();
    const view = await panelView(db);
    const withData = view.nodes.filter((n) => n.level !== null || n.threshold !== null);
    assert.deepStrictEqual(withData.map((n) => n.code), ['qy_peak_xunlian']);
    assert.equal(withData[0]?.level, 5);
    assert.equal(withData[0]?.threshold, 75);
    // 反例守卫：绝不能出现 `Number(null) === 0` 造成的「怪物境界 0」
    const zeros = view.nodes.filter((n) => n.level === 0 || n.threshold === 0);
    assert.deepStrictEqual(zeros.map((n) => n.code), [], 'null 不得被回落成 0');
  });

  test('新角色 panel：11 个对象，宿主都在四院或主峰，featureKey 全非空、kind=office', async () => {
    const { db } = seedDb();
    const view = await panelView(db);
    assert.equal(view.objects.length, 11);
    const hosts = new Set(['qy_chuanfayuan', 'qy_yulingyuan', 'qy_baigongyuan', 'qy_zhifayuan', 'qy_summit']);
    for (const object of view.objects) {
      assert.ok(hosts.has(object.nodeCode), `${object.code} 的宿主非法：${object.nodeCode}`);
      assert.ok(typeof object.featureKey === 'string' && object.featureKey.length > 0, `${object.code} 缺 featureKey`);
      assert.equal(object.kind, 'office');
    }
    // 百工院两项：丹霞院（炼丹）+ 百器阁（炼器）
    const baigong = view.objects.filter((o) => o.nodeCode === 'qy_baigongyuan').map((o) => o.code).sort();
    assert.deepStrictEqual(baigong, ['obj_baiqige', 'obj_danxiayuan']);
  });

  test('从北门出发沿边能走遍全部 17 个节点（拓扑真连通）', async () => {
    const { db } = seedDb();
    const view = await panelView(db);
    const adjacency = new Map<string, string[]>(view.nodes.map((n) => [n.code, []]));
    for (const edge of seedEdges) {
      adjacency.get(edge.fromNodeCode)?.push(edge.toNodeCode);
      if (edge.bidirectional !== false) adjacency.get(edge.toNodeCode)?.push(edge.fromNodeCode);
    }
    const reached = new Set<string>(['qy_gate_n']);
    const queue = ['qy_gate_n'];
    while (queue.length > 0) {
      for (const next of adjacency.get(queue.shift() as string) ?? []) {
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    assert.equal(reached.size, 17);
  });

  test('enter 山门（新角色）→ 成功且写 current_node_id；再 enter 不相邻峰 → NODE_NOT_ADJACENT', async () => {
    const { db, state } = seedDb();
    const svc = makeService(db);
    const first = await svc.enter(7, 'qy_gate_n');
    assert.equal(first.success, true);
    assert.deepStrictEqual(state, [{ character_id: 11, current_node_id: nodeId.get('qy_gate_n') }]);

    const bad = await svc.enter(7, 'qy_peak_3');
    assert.equal((bad.data as { code?: string }).code, 'NODE_NOT_ADJACENT');
  });

  test('enter 相邻峰（北门 → 第一峰）→ 成功；战力远低于门槛也成功（v3）', async () => {
    const { db, state } = seedDb();
    const svc = makeService(db, 1); // 1 境裸装 = 20 战力
    await svc.enter(7, 'qy_gate_n');
    const res = await svc.enter(7, 'qy_peak_1');
    assert.equal(res.success, true, '相邻即可前往，战力不拦路');
    assert.deepStrictEqual(state, [{ character_id: 11, current_node_id: nodeId.get('qy_peak_1') }]);
  });

  test('enter 山门后 panel：currentNodeCode 更新，相邻集合 = 四门 ∪ 北门的两个邻峰', async () => {
    const { db } = seedDb();
    await makeService(db).enter(7, 'qy_gate_n');
    const view = await panelView(db);
    assert.equal(view.currentNodeCode, 'qy_gate_n');
    const adjacent = view.nodes.filter((n) => n.adjacent).map((n) => n.code).sort();
    assert.deepStrictEqual(adjacent, ['qy_gate_e', 'qy_gate_n', 'qy_gate_s', 'qy_gate_w', 'qy_peak_1', 'qy_peak_xunlian'].sort());
  });

  test('waypoint：未到达 -> NODE_NOT_VISITED；到达点亮后 -> 成功且更新 current_node_id', async () => {
    const { db, state } = seedDb();
    const svc = makeService(db);
    const locked = await svc.waypoint(7, 'qy_gate_s');
    assert.equal((locked.data as { code?: string }).code, 'NODE_NOT_VISITED');
    await svc.enter(7, 'qy_gate_s');
    await svc.enter(7, 'qy_gate_n');
    const res = await svc.waypoint(7, 'qy_gate_s');
    assert.equal(res.success, true);
    assert.deepStrictEqual(state, [{ character_id: 11, current_node_id: nodeId.get('qy_gate_s') }]);
  });
});
