/**
 * MapService 边界测试（settings-revision-2 §5 / §6 / §7）
 *
 * 覆盖：发现（只下发已发现节点）/ 跑图门槛（恰好等于通过、差 1 拒绝）/
 * enter 幂等 / 传送点三态 / 秘境 idle_unlocked 置位与幂等 / 离线闸门过度规则 /
 * 战力复用（装备数与功法等级变化改变检定结果）。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MapService } from '../../../src/modules/logic/map/internal/map.service.js';
import { PlayerPowerService } from '../../../src/modules/character/player-power.service.js';
import {
  safeInt,
  unlockedMapCodes,
  type MapRow,
} from '../../../src/modules/logic/map/internal/map.types.js';
import { APP_CONFIG } from '../../../src/common/config/app-config.js';
import { FakeDatabase } from '../../helpers/fake-db.js';
import { stub } from '../../helpers/stub.js';
import type { Character } from '../../../src/modules/character/character.service.js';

type Row = Record<string, unknown>;

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 11,
    userId: 7,
    nickname: '道友',
    gender: 'male',
    title: null,
    spiritStones: 0,
    silver: 0,
    realm: 2,
    lingyun: 100,
    jadeSlips: 0,
    ...overrides,
  };
}

function mapRow(overrides: Row = {}): Row {
  return {
    id: 1,
    code: 'map_qingyun',
    name: '青云宗',
    world: 'world_qingyun',
    order_index: 1,
    chapter_from: 1,
    chapter_to: 2,
    requires_map_code: null,
    description: null,
    // P1 画布坐标空间（缺省 21×21，与 schema 默认值一致）
    grid_rows: 21,
    grid_cols: 21,
    background_key: null,
    ...overrides,
  };
}

function nodeRow(overrides: Row = {}): Row {
  return {
    id: 1,
    code: 'n1',
    map_id: 1,
    name: '入口',
    ring: 'outer',
    sector: null,
    kind: 'route',
    feature_key: null,
    level: 1,
    threshold: 100,
    has_waypoint: false,
    chapter: 1,
    requires_node_code: null,
    zone_code: null,
    order_index: 1,
    // P1 画布坐标：0-based 交叉线索引
    grid_row: 0,
    grid_col: 0,
    description: null,
    ...overrides,
  };
}

function edgeRow(overrides: Row = {}): Row {
  return { id: 1, map_id: 1, from_node_id: 1, to_node_id: 2, bidirectional: true, ...overrides };
}

function nodeProgressRow(overrides: Row = {}): Row {
  return {
    id: 1,
    character_id: 11,
    node_id: 1,
    visited: false,
    waypoint_unlocked: false,
    idle_unlocked: false,
    cleared: false,
    ...overrides,
  };
}

interface MapDbOptions {
  maps?: Row[];
  nodes?: Row[];
  edges?: Row[];
  /** 对象层（`game_map_objects`，P2.0 §3）。 */
  objects?: Row[];
  progress?: Row[];
  /** 角色当前所在（`game_map_state`，P2.0 §5）。 */
  state?: Row[];
  equip?: string | null;
  skill?: string | null;
  /** 已完成的章节序号（D4 地图解锁闸门的依据）。 */
  completedChapters?: number[];
}

/** 假库：`game_node_progress` 的写入会真的改内存状态，用于验证幂等（重复 enter 不重复写） */
function mapDb(opts: MapDbOptions = {}) {
  const maps = opts.maps ?? [];
  const nodes = opts.nodes ?? [];
  const edges = opts.edges ?? [];
  const objects = opts.objects ?? [];
  const progress: Row[] = (opts.progress ?? []).map((p) => ({ ...p }));
  const state: Row[] = (opts.state ?? []).map((s) => ({ ...s }));
  let seq = progress.length;
  const find = (charId: unknown, nodeId: unknown) =>
    progress.find((p) => p.character_id === charId && p.node_id === nodeId);

  const db = new FakeDatabase()
    .on(/FROM game_maps ORDER BY order_index, id/, { rows: maps })
    .on(/FROM game_map_nodes ORDER BY map_id, order_index, id/, { rows: nodes })
    .on(/FROM game_map_edges ORDER BY map_id, id/, { rows: edges })
    .on(/FROM game_map_objects ORDER BY map_id, node_code, order_index, id/, { rows: objects })
    .on(/FROM game_map_nodes WHERE code = \$1/, (params) => ({
      rows: nodes.filter((n) => n.code === params[0]),
    }))
    .on(/FROM game_map_nodes WHERE zone_code = \$1 AND kind = 'secret_realm'/, (params) => ({
      rows: nodes.filter((n) => n.zone_code === params[0] && n.kind === 'secret_realm'),
    }))
    .on(/FROM game_node_progress WHERE character_id = \$1 AND node_id = \$2/, (params) => ({
      rows: progress.filter((p) => p.character_id === params[0] && p.node_id === params[1]),
    }))
    .on(/FROM game_node_progress WHERE character_id = \$1$/, (params) => ({
      rows: progress.filter((p) => p.character_id === params[0]),
    }))
    .on(/INSERT INTO game_node_progress/, (params, sql) => {
      const [charId, nodeId] = params as [number, number, unknown];
      let row = find(charId, nodeId);
      if (!row) {
        seq += 1;
        row = { id: seq, character_id: charId, node_id: nodeId, visited: false, waypoint_unlocked: false, idle_unlocked: false, cleared: false };
        progress.push(row);
      }
      if (sql.includes('waypoint_unlocked = game_node_progress')) {
        row.visited = true;
        row.waypoint_unlocked = Boolean(row.waypoint_unlocked) || Boolean(params[2]);
      } else {
        row.idle_unlocked = true;
        row.cleared = Boolean(row.cleared) || Boolean(params[2]);
      }
      return { rows: [row] };
    })
    // P2.0 §5：角色当前所在（game_map_state）的读写
    .on(/FROM game_map_state WHERE character_id = \$1/, (params) => ({
      rows: state.filter((s) => s.character_id === params[0]),
    }))
    .on(/INSERT INTO game_map_state/, (params) => {
      const [charId, nodeId] = params as [number, number];
      let row = state.find((s) => s.character_id === charId);
      if (!row) {
        row = { character_id: charId, current_node_id: nodeId };
        state.push(row);
      } else {
        row.current_node_id = nodeId;
      }
      return { rows: [row] };
    })
    .on(/COUNT\(\*\)::text AS c FROM game_items/, {
      rows: opts.equip == null ? [] : [{ c: opts.equip }],
    })
    .on(/COALESCE\(SUM\(level\), 0\)::text AS s/, {
      rows: opts.skill == null ? [] : [{ s: opts.skill }],
    })
    // D4 地图解锁的判定依据：已完成章节（status='completed'）
    .on(/FROM game_chapter_progress p/, {
      rows: (opts.completedChapters ?? []).map((chapter) => ({ chapter })),
    });
  return { db, progress, maps, nodes, edges, objects, state };
}

function makeService(opts: { db: FakeDatabase; character?: Character | null }) {
  const character = opts.character === undefined ? makeChar() : opts.character;
  const charStub = { findByUserId: stub(async () => character) };
  const power = new PlayerPowerService(opts.db as never);
  const svc = new MapService(opts.db as never, charStub as never, power as never);
  return { svc, charStub, power };
}

function failingCode(res: { success: boolean; data?: unknown }): string | undefined {
  return (res.data as { code?: string } | undefined)?.code;
}

function codesOf(data: unknown, mapIndex = 0): string[] {
  const maps = (data as { maps: Array<{ nodes: Array<{ code: string }> }> }).maps;
  return maps[mapIndex].nodes.map((n) => n.code);
}

const N1 = nodeRow({ id: 1, code: 'n1', name: '入口', order_index: 1, threshold: 100, has_waypoint: true });
const N2 = nodeRow({ id: 2, code: 'n2', name: '二阶', order_index: 2, threshold: 100, requires_node_code: 'n1' });
const N3 = nodeRow({
  id: 3,
  code: 'n3',
  name: '三阶',
  order_index: 3,
  threshold: 30,
  requires_node_code: 'n2',
  has_waypoint: true,
});
const E1 = edgeRow({ id: 1, from_node_id: 1, to_node_id: 2 });
const E2 = edgeRow({ id: 2, from_node_id: 2, to_node_id: 3 });

// ===== P1 画布：坐标 / 底图列（historical bug：只改 interface 漏改 SELECT → Number(undefined) = NaN）=====

describe('MapService.panel 画布坐标映射（P1）', () => {
  test('DTO 的 gridRow/gridCol 是有限整数且落在 0..gridRows / 0..gridCols 内', async () => {
    const maps = [mapRow({ grid_rows: 21, grid_cols: 21 })];
    const nodes = [
      nodeRow({ id: 1, code: 'n1', grid_row: 0, grid_col: 21 }),
      nodeRow({ id: 2, code: 'n2', grid_row: 21, grid_col: 0, requires_node_code: 'n1' }),
    ];
    // 两个节点都要已发现才会下发（发现规则见 §5.2）
    const progress = [nodeProgressRow({ id: 1, node_id: 1, visited: true }), nodeProgressRow({ id: 2, node_id: 2, visited: true })];
    const { db } = mapDb({ maps, nodes, progress });
    const data = (await makeService({ db }).svc.panel(7)).data as {
      maps: Array<{
        gridRows: number;
        gridCols: number;
        backgroundKey: string | null;
        nodes: Array<{ code: string; gridRow: number; gridCol: number; description: string | null }>;
      }>;
    };
    const view = data.maps[0];
    assert.equal(view.gridRows, 21);
    assert.equal(view.gridCols, 21);
    assert.equal(view.backgroundKey, null);
    for (const node of view.nodes) {
      for (const value of [node.gridRow, node.gridCol]) {
        assert.ok(Number.isFinite(value), `${node.code} 的坐标不是有限数：${value}`);
        assert.ok(Number.isInteger(value), `${node.code} 的坐标不是整数：${value}`);
        assert.ok(value >= 0, `${node.code} 的坐标为负：${value}`);
        assert.ok(value <= 21, `${node.code} 的坐标越界：${value}`);
      }
    }
    // 两端（0 与 grid_cols / grid_rows）必须原样保留，不做 ±1 偏移
    assert.deepStrictEqual(
      view.nodes.map((n) => [n.gridRow, n.gridCol]),
      [[0, 21], [21, 0]],
    );
  });

  test('description 映射到 DTO；缺失时收敛为 null（不出现 undefined）', async () => {
    const maps = [mapRow()];
    const nodes = [
      nodeRow({ id: 1, code: 'n1', description: '常年妖兽出没' }),
      nodeRow({ id: 2, code: 'n2', requires_node_code: 'n1', description: undefined }),
    ];
    // n2 的前置 n1 已访问，两个节点才都会下发
    const progress = [nodeProgressRow({ id: 1, node_id: 1, visited: true })];
    const { db } = mapDb({ maps, nodes, progress });
    const data = (await makeService({ db }).svc.panel(7)).data as {
      maps: Array<{ nodes: Array<{ code: string; description: string | null }> }>;
    };
    const byCode = new Map(data.maps[0].nodes.map((n) => [n.code, n.description]));
    assert.equal(byCode.get('n1'), '常年妖兽出没');
    assert.equal(byCode.get('n2'), null);
  });

  test('缺列 / 非法列（undefined、NaN、负数、字符串数字）都不产出 NaN', async () => {
    const maps = [mapRow({ grid_rows: undefined, grid_cols: 'abc' })];
    const nodes = [
      nodeRow({ id: 1, code: 'n1', grid_row: undefined, grid_col: undefined }),
      nodeRow({ id: 2, code: 'n2', requires_node_code: 'n1', grid_row: Number.NaN, grid_col: -3 }),
      nodeRow({ id: 3, code: 'n3', requires_node_code: 'n2', grid_row: '7', grid_col: '12.9' }),
    ];
    // 前置链逐个「已访问」，三个节点才都在下发集合里
    const progress = [
      nodeProgressRow({ id: 1, node_id: 1, visited: true }),
      nodeProgressRow({ id: 2, node_id: 2, visited: true }),
    ];
    const { db } = mapDb({ maps, nodes, progress });
    const data = (await makeService({ db }).svc.panel(7)).data as {
      maps: Array<{
        gridRows: number;
        gridCols: number;
        nodes: Array<{ code: string; gridRow: number; gridCol: number }>;
      }>;
    };
    const view = data.maps[0];
    // 缺列 → 回退 1（至少 1×1，前端不会算出 0 宽高画布）；非法字符串同理
    assert.equal(view.gridRows, 1);
    assert.equal(view.gridCols, 1);
    const byCode = new Map(view.nodes.map((n) => [n.code, n]));
    assert.deepStrictEqual([byCode.get('n1')?.gridRow, byCode.get('n1')?.gridCol], [0, 0]);
    assert.deepStrictEqual([byCode.get('n2')?.gridRow, byCode.get('n2')?.gridCol], [0, 0]);
    // 字符串数字取整（12.9 → 12），不保留小数
    assert.deepStrictEqual([byCode.get('n3')?.gridRow, byCode.get('n3')?.gridCol], [7, 12]);
    for (const node of view.nodes) {
      assert.ok(Number.isFinite(node.gridRow) && Number.isFinite(node.gridCol), `${node.code} 产出 NaN`);
    }
  });

  test('enter / waypoint 的成功响应同样带坐标（不是只有 panel 有）', async () => {
    const maps = [mapRow()];
    // 门槛 30：2 境裸装战力 40 够用（否则 enter 会因战力不足失败）
    const nodes = [nodeRow({ id: 1, code: 'n1', grid_row: 4, grid_col: 9, has_waypoint: true, threshold: 30 })];
    const { db } = mapDb({ maps, nodes });
    const enter = (await makeService({ db }).svc.enter(7, 'n1')).data as {
      node: { gridRow: number; gridCol: number };
    };
    assert.deepStrictEqual([enter.node.gridRow, enter.node.gridCol], [4, 9]);
    const waypoint = (await makeService({ db }).svc.waypoint(7, 'n1')).data as {
      node: { gridRow: number; gridCol: number };
    };
    assert.deepStrictEqual([waypoint.node.gridRow, waypoint.node.gridCol], [4, 9]);
  });

  test('safeInt 边界：NaN / Infinity / null / undefined / 负数 / 小数 / 字符串数字', () => {
    assert.equal(safeInt(undefined, 5), 5);
    assert.equal(safeInt(null, 5), 0); // Number(null) === 0，合法整数
    assert.equal(safeInt(Number.NaN, 5), 5);
    assert.equal(safeInt(Number.POSITIVE_INFINITY, 5), 5);
    assert.equal(safeInt(-1, 5), 5);
    assert.equal(safeInt(0, 5), 0);
    assert.equal(safeInt(3.9, 5), 3);
    assert.equal(safeInt('12', 5), 12);
    assert.equal(safeInt('', 5), 0);
    assert.equal(safeInt('abc', 5), 5);
  });
});

// ===== 发现 / 可见性 =====

describe('MapService.panel 发现边界（§5.2 到达即发现）', () => {
  test('无角色 -> CHARACTER_NOT_FOUND', async () => {
    const { db } = mapDb();
    const { svc } = makeService({ db, character: null });
    assert.equal(failingCode(await svc.panel(7)), 'CHARACTER_NOT_FOUND');
  });

  test('无进度 -> 只有入口节点下发，且不含通往未发现节点的边', async () => {
    const { db } = mapDb({ maps: [mapRow()], nodes: [N1, N2, N3], edges: [E1, E2] });
    const data = (await makeService({ db }).svc.panel(7)).data as {
      total: number;
      maps: Array<{ nodes: unknown[]; edges: unknown[] }>;
    };
    assert.equal(data.total, 1);
    assert.deepEqual(codesOf(data), ['n1']);
    assert.deepEqual(data.maps[0].edges, []);
  });

  test('前置 visited 后逐个揭开：n1 访问 -> n2 可见；n2 访问 -> n3 可见', async () => {
    const first = mapDb({
      maps: [mapRow()],
      nodes: [N1, N2, N3],
      edges: [E1, E2],
      progress: [nodeProgressRow({ id: 1, node_id: 1, visited: true })],
    });
    const firstData = (await makeService({ db: first.db }).svc.panel(7)).data as {
      maps: Array<{ edges: Array<{ fromNodeCode: string; toNodeCode: string }> }>;
    };
    assert.deepEqual(codesOf(firstData), ['n1', 'n2']);
    assert.deepEqual(firstData.maps[0].edges, [{ fromNodeCode: 'n1', toNodeCode: 'n2', bidirectional: true }]);

    const second = mapDb({
      maps: [mapRow()],
      nodes: [N1, N2, N3],
      edges: [E1, E2],
      progress: [
        nodeProgressRow({ id: 1, node_id: 1, visited: true }),
        nodeProgressRow({ id: 2, node_id: 2, visited: true }),
      ],
    });
    const secondData = (await makeService({ db: second.db }).svc.panel(7)).data;
    assert.deepEqual(codesOf(secondData), ['n1', 'n2', 'n3']);
  });

  test('requires_node_code 指向不存在节点 -> 永不可见；自身 visited 时兜底可见', async () => {
    const ghost = nodeRow({ id: 9, code: 'n_ghost', name: '幽灵', order_index: 9, requires_node_code: 'nope' });
    const hidden = mapDb({ maps: [mapRow()], nodes: [N1, ghost] });
    const hiddenData = (await makeService({ db: hidden.db }).svc.panel(7)).data;
    assert.deepEqual(codesOf(hiddenData), ['n1']);

    const selfVisited = mapDb({
      maps: [mapRow()],
      nodes: [N1, ghost],
      progress: [nodeProgressRow({ id: 5, node_id: 9, visited: true })],
    });
    const selfData = (await makeService({ db: selfVisited.db }).svc.panel(7)).data;
    assert.deepEqual(codesOf(selfData), ['n1', 'n_ghost']);
  });

  test('feature_key 原样下发（未实现系统不做服务端判断）', async () => {
    const skillNode = nodeRow({ id: 4, code: 'n_skill', name: '藏书阁', feature_key: 'skill', order_index: 4 });
    const alchemyNode = nodeRow({ id: 5, code: 'n_alchemy', name: '丹霞院', feature_key: 'alchemy', order_index: 5 });
    const unusedFeature = nodeRow({ id: 6, code: 'n_pvp', name: '天刑台', feature_key: 'pvp', order_index: 6 });
    const { db } = mapDb({ maps: [mapRow()], nodes: [N1, skillNode, alchemyNode, unusedFeature] });
    const data = (await makeService({ db }).svc.panel(7)).data as {
      maps: Array<{ nodes: Array<{ code: string; featureKey: string | null }> }>;
    };
    const byCode = new Map(data.maps[0].nodes.map((n) => [n.code, n.featureKey]));
    assert.equal(byCode.get('n_skill'), 'skill');
    assert.equal(byCode.get('n_alchemy'), 'alchemy');
    assert.equal(byCode.get('n_pvp'), 'pvp');
    assert.equal(byCode.get('n1'), null);
  });

  test('空配置 -> total=0 / maps=[]', async () => {
    const { db } = mapDb();
    const data = (await makeService({ db }).svc.panel(7)).data as { total: number; maps: unknown[] };
    assert.equal(data.total, 0);
    assert.deepEqual(data.maps, []);
  });
});

// ===== 跑图 enter =====

describe('MapService.enter 边界（§5.2 + §6.2）', () => {
  test('节点不存在（含空串）-> NODE_NOT_FOUND', async () => {
    for (const code of ['nope', '']) {
      const { db } = mapDb({ maps: [mapRow()], nodes: [N1] });
      const res = await makeService({ db }).svc.enter(7, code);
      assert.equal(failingCode(res), 'NODE_NOT_FOUND');
      assert.deepEqual((res.data as { nodeCode: string }).nodeCode, code);
    }
  });

  test('requires_node_code 本轮不再是进入闸门：山门节点即使带前置也可直接进', async () => {
    // P2.0 §5：进入闸门改为「相邻 / 山门」，requires 字段保留但不再拦截
    const { db } = mapDb({ maps: [mapRow()], nodes: [N1, N2], equip: '12' });
    const res = await makeService({ db }).svc.enter(7, 'n2');
    assert.equal(res.success, true);
    assert.equal(failingCode(res), undefined);
  });

  test('战力限制已删除：战力远低于门槛也成功，threshold 仍回显（v3 §5）', async () => {
    const ok = mapDb({ maps: [mapRow()], nodes: [N1], equip: '12' });
    const okRes = await makeService({ db: ok.db }).svc.enter(7, 'n1');
    assert.equal(okRes.success, true);
    assert.equal((okRes.data as { playerPower: number }).playerPower, 100);
    assert.equal((okRes.data as { threshold: number }).threshold, 100);
    assert.equal((okRes.data as { firstVisit: boolean }).firstVisit, true);

    // equip=11 -> 战力 95 < 门槛 100，但前往只看相邻（N1 是山门），必须成功
    const short = mapDb({ maps: [mapRow()], nodes: [N1], equip: '11' });
    const shortRes = await makeService({ db: short.db }).svc.enter(7, 'n1');
    assert.equal(shortRes.success, true);
    assert.equal(failingCode(shortRes), undefined);
    assert.equal((shortRes.data as { playerPower: number }).playerPower, 95);
    assert.equal((shortRes.data as { threshold: number }).threshold, 100);
    assert.equal(short.db.callsMatching(/INSERT INTO game_node_progress/).length, 1);
  });

  test('战力仍复用 PlayerPowerService（只影响回显，不再影响成败）', async () => {
    const withEquip = mapDb({ maps: [mapRow()], nodes: [N1], equip: '20' });
    const without = mapDb({ maps: [mapRow()], nodes: [N1], equip: '0' });
    const high = await makeService({ db: withEquip.db }).svc.enter(7, 'n1');
    const low = await makeService({ db: without.db }).svc.enter(7, 'n1');
    assert.equal(high.success, true);
    assert.equal(low.success, true);
    assert.equal((high.data as { playerPower: number }).playerPower, 140);
    assert.equal((low.data as { playerPower: number }).playerPower, 40);
  });

  test('功法等级变化同样只影响战力回显（不再拦前往）', async () => {
    const node = nodeRow({ id: 1, code: 'n1', threshold: 102, has_waypoint: false });
    const withSkill = mapDb({ maps: [mapRow()], nodes: [node], equip: '12', skill: '4' });
    const noSkill = mapDb({ maps: [mapRow()], nodes: [node], equip: '12', skill: '2' });
    const a = await makeService({ db: withSkill.db }).svc.enter(7, 'n1');
    const b = await makeService({ db: noSkill.db }).svc.enter(7, 'n1');
    assert.equal(a.success, true);
    assert.equal((a.data as { playerPower: number }).playerPower, 102);
    assert.equal(b.success, true);
    assert.equal((b.data as { playerPower: number }).playerPower, 101);
  });

  test('首次到达写 visited；带传送点的节点同时点亮 waypoint_unlocked', async () => {
    const { db, progress } = mapDb({ maps: [mapRow()], nodes: [N1], equip: '12' });
    const res = await makeService({ db }).svc.enter(7, 'n1');
    assert.equal(res.success, true);
    assert.equal(db.callsMatching(/INSERT INTO game_node_progress/).length, 1);
    assert.deepEqual(progress, [
      { id: 1, character_id: 11, node_id: 1, visited: true, waypoint_unlocked: true, idle_unlocked: false, cleared: false },
    ]);
    const view = (res.data as { node: { progress: unknown } }).node;
    assert.deepEqual(view.progress, { visited: true, waypointUnlocked: true, idleUnlocked: false, cleared: false });
  });

  test('不带传送点的节点 -> waypoint_unlocked 保持 false', async () => {
    const plain = nodeRow({ id: 1, code: 'n1', has_waypoint: false });
    const { db, progress } = mapDb({ maps: [mapRow()], nodes: [plain], equip: '12' });
    await makeService({ db }).svc.enter(7, 'n1');
    assert.equal(progress[0].waypoint_unlocked, false);
  });

  test('重复 enter 同一节点幂等：不报错、不重复写、firstVisit 第二次为 false', async () => {
    const { db, progress } = mapDb({ maps: [mapRow()], nodes: [N1], equip: '12' });
    const { svc } = makeService({ db });
    const first = await svc.enter(7, 'n1');
    const second = await svc.enter(7, 'n1');
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal((first.data as { firstVisit: boolean }).firstVisit, true);
    assert.equal((second.data as { firstVisit: boolean }).firstVisit, false);
    assert.equal(db.callsMatching(/INSERT INTO game_node_progress/).length, 1, '重复 enter 不应重复写库');
    assert.equal(progress.length, 1);
  });

  test('前置已访问后可以进入下一节点（发现链推进）', async () => {
    const { db, progress } = mapDb({
      maps: [mapRow()],
      nodes: [N1, N2],
      progress: [nodeProgressRow({ id: 1, node_id: 1, visited: true, waypoint_unlocked: true })],
      equip: '12',
    });
    const res = await makeService({ db }).svc.enter(7, 'n2');
    assert.equal(res.success, true);
    assert.deepEqual(progress.map((p) => [p.node_id, p.visited]), [[1, true], [2, true]]);
  });
});

// ===== 相邻移动闸门（P2.0 §5：相邻可直接前往）=====

describe('MapService.enter 相邻闸门（P2.0 §5）', () => {
  const GATE = nodeRow({ id: 1, code: 'gate', ring: 'outer', threshold: 10, has_waypoint: true });
  const H1 = nodeRow({ id: 2, code: 'h1', ring: 'inner', threshold: 10 });
  const H2 = nodeRow({ id: 3, code: 'h2', ring: 'inner', threshold: 10 });
  const H3 = nodeRow({ id: 4, code: 'h3', ring: 'inner', threshold: 10 });
  const H1H2 = edgeRow({ id: 1, from_node_id: 2, to_node_id: 3 });
  const NODES = [GATE, H1, H2, H3];
  /** 4 级角色的裸装战力 (realm×20) 足以过 threshold=10。 */
  const CHAR = makeChar({ realm: 2 });

  test('相邻（有边）-> 成功且 current_node_id 更新', async () => {
    const { db, state } = mapDb({
      maps: [mapRow()],
      nodes: NODES,
      edges: [H1H2],
      state: [{ character_id: 11, current_node_id: 2 }],
    });
    const res = await makeService({ db, character: CHAR }).svc.enter(7, 'h2');
    assert.equal(res.success, true);
    assert.deepEqual(state, [{ character_id: 11, current_node_id: 3 }]);
  });

  test('不相邻且非山门 -> NODE_NOT_ADJACENT（防回归核心）', async () => {
    const { db, state, progress } = mapDb({
      maps: [mapRow()],
      nodes: NODES,
      edges: [H1H2],
      state: [{ character_id: 11, current_node_id: 2 }],
    });
    const res = await makeService({ db, character: CHAR }).svc.enter(7, 'h3');
    assert.equal(failingCode(res), 'NODE_NOT_ADJACENT');
    assert.deepEqual(res.data, { code: 'NODE_NOT_ADJACENT', nodeCode: 'h3' });
    assert.equal(db.callsMatching(/INSERT INTO game_node_progress/).length, 0);
    assert.equal(progress.length, 0);
    assert.deepEqual(state, [{ character_id: 11, current_node_id: 2 }]);
  });

  test('相邻但战力远低于门槛 -> 仍然成功（v3 §5 已删除战力限制，防回归）', async () => {
    const tough = nodeRow({ id: 3, code: 'h2', ring: 'inner', threshold: 100 });
    const { db, state, progress } = mapDb({
      maps: [mapRow()],
      nodes: [GATE, H1, tough],
      edges: [H1H2],
      state: [{ character_id: 11, current_node_id: 2 }],
    });
    // CHAR 为 2 境裸装 = 40 战力，远低于 threshold=100
    const res = await makeService({ db, character: CHAR }).svc.enter(7, 'h2');
    assert.equal(res.success, true);
    assert.equal(failingCode(res), undefined);
    assert.equal((res.data as { playerPower: number }).playerPower, 40);
    assert.equal((res.data as { threshold: number }).threshold, 100);
    assert.deepEqual(state, [{ character_id: 11, current_node_id: 3 }]);
    assert.equal(progress.length, 1);
  });

  test('新角色（current=null）：四门可进，非山门 NODE_NOT_ADJACENT', async () => {
    const gate = mapDb({ maps: [mapRow()], nodes: NODES, state: [] });
    assert.equal((await makeService({ db: gate.db, character: CHAR }).svc.enter(7, 'gate')).success, true);

    const inner = mapDb({ maps: [mapRow()], nodes: NODES, state: [] });
    const res = await makeService({ db: inner.db, character: CHAR }).svc.enter(7, 'h1');
    assert.equal(failingCode(res), 'NODE_NOT_ADJACENT');
  });

  test('current_node_id 指向已删节点（配置漂移）-> 不崩，退化为「只有四门可进」', async () => {
    const drift = mapDb({
      maps: [mapRow()],
      nodes: NODES,
      edges: [H1H2],
      state: [{ character_id: 11, current_node_id: 999 }],
    });
    const svc = makeService({ db: drift.db, character: CHAR }).svc;
    assert.equal(failingCode(await svc.enter(7, 'h1')), 'NODE_NOT_ADJACENT');
    assert.equal((await svc.enter(7, 'gate')).success, true);
  });

  test('山门始终放行（即使与当前所在地不相邻）', async () => {
    const { db } = mapDb({
      maps: [mapRow()],
      nodes: NODES,
      edges: [H1H2],
      state: [{ character_id: 11, current_node_id: 3 }],
    });
    const res = await makeService({ db, character: CHAR }).svc.enter(7, 'gate');
    assert.equal(res.success, true);
  });
});

// ===== 当前所在（P2.0 §5）=====

describe('MapService 当前所在 game_map_state（P2.0 §5）', () => {
  test('enter 成功后写入 current_node_id（新角色首次建档）', async () => {
    const { db, state } = mapDb({ maps: [mapRow()], nodes: [N1], equip: '12' });
    const res = await makeService({ db }).svc.enter(7, 'n1');
    assert.equal(res.success, true);
    assert.deepEqual(state, [{ character_id: 11, current_node_id: 1 }]);
  });

  test('enter 失败（不相邻）不得写 current_node_id', async () => {
    const h1 = nodeRow({ id: 2, code: 'h1', ring: 'inner', threshold: 10 });
    const h2 = nodeRow({ id: 3, code: 'h2', ring: 'inner', threshold: 10 });
    const { db, state } = mapDb({
      maps: [mapRow()],
      nodes: [h1, h2],
      state: [{ character_id: 11, current_node_id: 2 }],
    });
    assert.equal(failingCode(await makeService({ db }).svc.enter(7, 'h2')), 'NODE_NOT_ADJACENT');
    assert.deepEqual(state, [{ character_id: 11, current_node_id: 2 }]);
    assert.equal(db.callsMatching(/INSERT INTO game_map_state/).length, 0);
  });

  test('waypoint 成功后也更新 current_node_id（语义不变：仍要求已点亮）', async () => {
    const { db, state } = mapDb({
      maps: [mapRow()],
      nodes: [N1, N3],
      edges: [E1, E2],
      progress: [nodeProgressRow({ id: 1, node_id: 3, visited: true, waypoint_unlocked: true })],
      state: [{ character_id: 11, current_node_id: 1 }],
    });
    const res = await makeService({ db }).svc.waypoint(7, 'n3');
    assert.equal(res.success, true);
    assert.deepEqual(state, [{ character_id: 11, current_node_id: 3 }]);
  });

  test('waypoint 失败（未点亮）不得写 current_node_id', async () => {
    const { db, state } = mapDb({
      maps: [mapRow()],
      nodes: [N3],
      progress: [nodeProgressRow({ id: 1, node_id: 3, visited: true, waypoint_unlocked: false })],
      state: [{ character_id: 11, current_node_id: 1 }],
    });
    assert.equal(failingCode(await makeService({ db }).svc.waypoint(7, 'n3')), 'WAYPOINT_NOT_UNLOCKED');
    assert.deepEqual(state, [{ character_id: 11, current_node_id: 1 }]);
    assert.equal(db.callsMatching(/INSERT INTO game_map_state/).length, 0);
  });

  test('重复 enter 同一节点：current_node_id 幂等（不重复建档）', async () => {
    const { db, state } = mapDb({ maps: [mapRow()], nodes: [N1], equip: '12' });
    const { svc } = makeService({ db });
    await svc.enter(7, 'n1');
    await svc.enter(7, 'n1');
    assert.equal(state.length, 1);
    assert.equal(state[0].current_node_id, 1);
  });
});

// ===== DTO：相邻 / 当前所在 / 对象层（P2.0 v3 T7）=====

describe('MapService.panel DTO（adjacent / currentNodeCode / objects）', () => {
  const G = nodeRow({ id: 1, code: 'g', ring: 'outer', threshold: 10 });
  const A = nodeRow({ id: 2, code: 'a', ring: 'inner', threshold: 10 });
  const B = nodeRow({ id: 3, code: 'b', ring: 'inner', threshold: 10 });
  const C = nodeRow({ id: 4, code: 'c', ring: 'inner', threshold: 10 });
  const AB = edgeRow({ id: 1, from_node_id: 2, to_node_id: 3 });
  const OBJ: Row = {
    id: 1,
    code: 'o1',
    map_id: 1,
    node_code: 'b',
    kind: 'office',
    name: '丹霞院',
    feature_key: 'alchemy',
    description: '炉火整日不熄。',
    order_index: 1,
  };
  interface View {
    currentNodeCode: string | null;
    nodes: Array<{ code: string; adjacent: boolean }>;
    objects: Array<{ code: string; nodeCode: string; kind: string; featureKey: string | null; orderIndex: number }>;
  }
  const panelView = async (opts: MapDbOptions): Promise<View> => {
    const { db } = mapDb({ maps: [mapRow()], nodes: [G, A, B, C], ...opts });
    const data = (await makeService({ db }).svc.panel(7)).data as { maps: View[] };
    return data.maps[0];
  };

  test('新角色：currentNodeCode=null；四门恒为 adjacent（入口规则），其余 false', async () => {
    const view = await panelView({ edges: [AB] });
    assert.equal(view.currentNodeCode, null);
    assert.deepEqual(view.nodes.map((n) => [n.code, n.adjacent]), [
      ['g', true],
      ['a', false],
      ['b', false],
      ['c', false],
    ]);
  });

  test('currentNodeCode 来自 game_map_state；adjacent 含当前节点的邻居 + 全部山门', async () => {
    const view = await panelView({ edges: [AB], state: [{ character_id: 11, current_node_id: 2 }] });
    assert.equal(view.currentNodeCode, 'a');
    assert.deepEqual(view.nodes.map((n) => [n.code, n.adjacent]), [
      ['g', true],
      ['a', false],
      ['b', true],
      ['c', false],
    ]);
  });

  test('current_node_id 指向已删节点（配置漂移）-> currentNodeCode=null，只有山门可前往，不崩', async () => {
    const view = await panelView({ edges: [AB], state: [{ character_id: 11, current_node_id: 999 }] });
    assert.equal(view.currentNodeCode, null);
    assert.deepEqual(view.nodes.map((n) => n.adjacent), [true, false, false, false]);
  });

  test('current_node_id 属于另一张地图 -> 本图 currentNodeCode=null（不串图）', async () => {
    const other = mapRow({ id: 2, code: 'map_other' });
    const otherNode = nodeRow({ id: 9, code: 'other', map_id: 2, ring: 'inner' });
    const { db } = mapDb({
      maps: [mapRow(), other],
      nodes: [G, A, B, C, otherNode],
      edges: [AB],
      state: [{ character_id: 11, current_node_id: 9 }],
    });
    const data = (await makeService({ db }).svc.panel(7)).data as { maps: View[] };
    assert.equal(data.maps[0].currentNodeCode, null);
    assert.equal(data.maps[1].currentNodeCode, 'other');
  });

  test('对象层全量下发：按 map_id 过滤，字段映射为 camelCase', async () => {
    const view = await panelView({ objects: [OBJ] });
    assert.deepEqual(view.objects, [
      {
        id: 1,
        code: 'o1',
        nodeCode: 'b',
        kind: 'office',
        name: '丹霞院',
        featureKey: 'alchemy',
        description: '炉火整日不熄。',
        orderIndex: 1,
      },
    ]);
  });

  test('边界：objects=[] 与「对象宿主不存在」都不崩（前端自行过滤）', async () => {
    const empty = await panelView({ objects: [] });
    assert.deepEqual(empty.objects, []);
    const ghost = await panelView({ objects: [{ ...OBJ, code: 'ghost', node_code: 'no_such_node' }] });
    assert.equal(ghost.objects.length, 1);
    assert.equal(ghost.objects[0].nodeCode, 'no_such_node');
  });

  test('边界：列表顺序保持服务端给定的顺序（store/面板不重排）', async () => {
    const o2: Row = { ...OBJ, id: 2, code: 'o2', node_code: 'a', order_index: 1 };
    const view = await panelView({ objects: [OBJ, o2] });
    assert.deepEqual(view.objects.map((o) => o.code), ['o1', 'o2']);
  });
});

// ===== 传送点 waypoint =====

describe('MapService.waypoint 边界（§5.2）', () => {
  test('节点不存在 -> NODE_NOT_FOUND', async () => {
    const { db } = mapDb({ maps: [mapRow()], nodes: [N1] });
    assert.equal(failingCode(await makeService({ db }).svc.waypoint(7, 'nope')), 'NODE_NOT_FOUND');
  });

  test('从未到达过 -> NODE_NOT_VISITED', async () => {
    const { db } = mapDb({ maps: [mapRow()], nodes: [N1] });
    const res = await makeService({ db }).svc.waypoint(7, 'n1');
    assert.equal(failingCode(res), 'NODE_NOT_VISITED');
    assert.deepEqual(res.data, { code: 'NODE_NOT_VISITED', nodeCode: 'n1' });
  });

  test('到达过但传送点未点亮 -> WAYPOINT_NOT_UNLOCKED', async () => {
    const n = nodeRow({ id: 1, code: 'n1', has_waypoint: true });
    const { db } = mapDb({
      maps: [mapRow()],
      nodes: [n],
      progress: [nodeProgressRow({ id: 1, node_id: 1, visited: true, waypoint_unlocked: false })],
    });
    const res = await makeService({ db }).svc.waypoint(7, 'n1');
    assert.equal(failingCode(res), 'WAYPOINT_NOT_UNLOCKED');
    assert.equal((res.data as { hasWaypoint: boolean }).hasWaypoint, true);
    assert.equal(db.callsMatching(/INSERT INTO game_node_progress/).length, 0);
  });

  test('目标不是传送点节点（has_waypoint=false）-> WAYPOINT_NOT_UNLOCKED 且 hasWaypoint=false', async () => {
    const n = nodeRow({ id: 1, code: 'n1', has_waypoint: false });
    const { db } = mapDb({
      maps: [mapRow()],
      nodes: [n],
      progress: [nodeProgressRow({ id: 1, node_id: 1, visited: true, waypoint_unlocked: false })],
    });
    const res = await makeService({ db }).svc.waypoint(7, 'n1');
    assert.equal(failingCode(res), 'WAYPOINT_NOT_UNLOCKED');
    assert.equal((res.data as { hasWaypoint: boolean }).hasWaypoint, false);
  });

  test('已点亮 -> 可直达，返回节点视图且不写库', async () => {
    const n = nodeRow({ id: 1, code: 'n1', name: '南门', has_waypoint: true });
    const { db } = mapDb({
      maps: [mapRow()],
      nodes: [n],
      progress: [nodeProgressRow({ id: 1, node_id: 1, visited: true, waypoint_unlocked: true })],
    });
    const res = await makeService({ db }).svc.waypoint(7, 'n1');
    assert.equal(res.success, true);
    assert.equal((res.data as { node: { code: string; name: string } }).node.code, 'n1');
    assert.equal(db.callsMatching(/INSERT INTO game_node_progress/).length, 0);
  });
});

// ===== 秘境三态：idle_unlocked 置位 =====

describe('MapService.onZoneFloorPassed 边界（§5.5 / D2）', () => {
  const REALM = nodeRow({
    id: 7,
    code: 'qy_houshan',
    name: '后山峰',
    kind: 'secret_realm',
    zone_code: 'zone_houshan',
    threshold: 115,
    order_index: 7,
  });

  test('非 Boss 层且未通关 -> not_boss，不写库', async () => {
    const { db } = mapDb({ maps: [mapRow()], nodes: [REALM] });
    const res = await makeService({ db }).svc.onZoneFloorPassed(11, {
      zoneCode: 'zone_houshan',
      floor: 1,
      isBossFloor: false,
      cleared: false,
    });
    assert.deepEqual(res, { changed: false, nodeCode: null, reason: 'not_boss' });
    assert.equal(db.callsMatching(/INSERT INTO game_node_progress/).length, 0);
  });

  test('Boss 层通过 -> idle_unlocked 置位（changed=true）', async () => {
    const { db, progress } = mapDb({ maps: [mapRow()], nodes: [REALM] });
    const res = await makeService({ db }).svc.onZoneFloorPassed(11, {
      zoneCode: 'zone_houshan',
      floor: 3,
      isBossFloor: true,
      cleared: true,
    });
    assert.deepEqual(res, { changed: true, nodeCode: 'qy_houshan', reason: 'unlocked' });
    assert.equal((progress[0] as { idle_unlocked: boolean }).idle_unlocked, true);
    assert.equal((progress[0] as { cleared: boolean }).cleared, true);
    assert.equal(db.callsMatching(/INSERT INTO game_node_progress/).length, 1);
  });

  test('幂等：重复置位只写一次，第二次返回 already_unlocked', async () => {
    const { db } = mapDb({ maps: [mapRow()], nodes: [REALM] });
    const { svc } = makeService({ db });
    const event = { zoneCode: 'zone_houshan', floor: 3, isBossFloor: true, cleared: true };
    const first = await svc.onZoneFloorPassed(11, event);
    const second = await svc.onZoneFloorPassed(11, event);
    assert.equal(first.changed, true);
    assert.deepEqual(second, { changed: false, nodeCode: 'qy_houshan', reason: 'already_unlocked' });
    assert.equal(db.callsMatching(/INSERT INTO game_node_progress/).length, 1);
  });

  test('已解锁后再传非 Boss 层 -> 不误报 changed', async () => {
    const { db } = mapDb({
      maps: [mapRow()],
      nodes: [REALM],
      progress: [nodeProgressRow({ id: 1, node_id: 7, visited: true, waypoint_unlocked: false, idle_unlocked: true })],
    });
    const res = await makeService({ db }).svc.onZoneFloorPassed(11, {
      zoneCode: 'zone_houshan',
      floor: 1,
      isBossFloor: false,
      cleared: false,
    });
    assert.equal(res.changed, false);
  });

  test('通关但非 Boss 层（兜底）-> 仍置位', async () => {
    const { db, progress } = mapDb({ maps: [mapRow()], nodes: [REALM] });
    const res = await makeService({ db }).svc.onZoneFloorPassed(11, {
      zoneCode: 'zone_houshan',
      floor: 2,
      isBossFloor: false,
      cleared: true,
    });
    assert.equal(res.changed, true);
    assert.equal(progress[0].idle_unlocked, true);
  });

  test('没有地图节点的遗留秘境 -> no_map_node，不写库（过渡规则）', async () => {
    const { db } = mapDb({ maps: [mapRow()], nodes: [REALM] });
    const res = await makeService({ db }).svc.onZoneFloorPassed(11, {
      zoneCode: 'zone_qingyun',
      floor: 10,
      isBossFloor: true,
      cleared: false,
    });
    assert.deepEqual(res, { changed: false, nodeCode: null, reason: 'no_map_node' });
    assert.equal(db.callsMatching(/INSERT INTO game_node_progress/).length, 0);
  });
});

// ===== 离线闸门 =====

describe('MapService.zoneIdleGate 边界（R2 过渡规则）', () => {
  const REALM = nodeRow({ id: 7, code: 'qy_houshan', name: '后山峰', kind: 'secret_realm', zone_code: 'zone_houshan' });

  test('遗留秘境（无地图节点）-> enforced=false（离线结算不受影响）', async () => {
    const { db } = mapDb({ maps: [mapRow()], nodes: [REALM] });
    for (const code of ['zone_qingyun', 'zone_miwu', 'zone_guhai', 'zone_dajie', 'zone_hundun']) {
      const gate = await makeService({ db }).svc.zoneIdleGate(11, code);
      assert.deepEqual(gate, { enforced: false, unlocked: false, nodeCode: null, nodeName: null }, code);
    }
  });

  test('挂在 qy_houshan 且未通关 -> enforced=true / unlocked=false', async () => {
    const { db } = mapDb({
      maps: [mapRow()],
      nodes: [REALM],
      progress: [nodeProgressRow({ id: 1, node_id: 7, visited: true, idle_unlocked: false })],
    });
    assert.deepEqual(await makeService({ db }).svc.zoneIdleGate(11, 'zone_houshan'), {
      enforced: true,
      unlocked: false,
      nodeCode: 'qy_houshan',
      nodeName: '后山峰',
    });
  });

  test('挂在 qy_houshan 且已通关 -> unlocked=true', async () => {
    const { db } = mapDb({
      maps: [mapRow()],
      nodes: [REALM],
      progress: [nodeProgressRow({ id: 1, node_id: 7, visited: true, idle_unlocked: true })],
    });
    assert.equal((await makeService({ db }).svc.zoneIdleGate(11, 'zone_houshan')).unlocked, true);
  });

  test('无进度行 -> 视为未解锁', async () => {
    const { db } = mapDb({ maps: [mapRow()], nodes: [REALM] });
    assert.equal((await makeService({ db }).svc.zoneIdleGate(11, 'zone_houshan')).unlocked, false);
  });
});

// ===== 战力复用回归 =====

describe('MapService 战力复用（APP_CONFIG.zonePower）', () => {
  test('panel 的 playerPower 与 ZoneService 同源权重（realm×rw + equip×ew + floor(skill/div)）', async () => {
    const { db } = mapDb({ maps: [mapRow()], nodes: [N1], equip: '3', skill: '5' });
    const cfg = APP_CONFIG.zonePower;
    const expected = 2 * cfg.realmWeight + 3 * cfg.equipWeight + Math.floor(5 / cfg.skillDivisor);
    const data = (await makeService({ db }).svc.panel(7)).data as { playerPower: number };
    assert.equal(data.playerPower, expected);
  });

  /**
   * 设计意图数值自证（用户定调 `052b146`）：本图历练至第五境。
   * 4 境裸装战力 80 ≥ 秘境第 1 层门槛 75 → 4 境即可进入历练；
   * 第 3 层门槛 99 ≤ 5 境裸装 100 → 5 境刚好能破 Boss 解锁离线挂机。
   */
  test('4 境裸装可入（80 ≥ 75）；5 境裸装可破第 3 层（100 ≥ 99）', async () => {
    const cfg = APP_CONFIG.zonePower;
    const floor1 = nodeRow({ id: 1, code: 'qy_houshan', name: '后山峰', kind: 'secret_realm', zone_code: 'zone_houshan', threshold: 75 });
    const floor3 = nodeRow({ id: 1, code: 'qy_houshan', name: '后山峰', kind: 'secret_realm', zone_code: 'zone_houshan', threshold: 99 });

    const realm4 = mapDb({ maps: [mapRow()], nodes: [floor1], equip: '0' });
    const enter1 = await makeService({ db: realm4.db, character: makeChar({ realm: 4 }) }).svc.enter(7, 'qy_houshan');
    assert.equal(enter1.success, true);
    assert.equal((enter1.data as { playerPower: number }).playerPower, 4 * cfg.realmWeight);

    const realm5 = mapDb({ maps: [mapRow()], nodes: [floor3], equip: '0' });
    const enter3 = await makeService({ db: realm5.db, character: makeChar({ realm: 5 }) }).svc.enter(7, 'qy_houshan');
    assert.equal(enter3.success, true);
    assert.equal((enter3.data as { playerPower: number }).playerPower, 5 * cfg.realmWeight);
  });
});

describe('地图解锁（D4：章节完成即解锁下一张地图）', () => {
  /** 第一张图（显式 `MapRow`：纯规则函数要求结构化类型，不能用宽松的 `Row`）。 */
  const FIRST_MAP = {
    id: 1,
    code: 'map_qingyun',
    name: '青云宗',
    world: 'world_qingyun',
    order_index: 1,
    chapter_from: 1,
    chapter_to: 2,
    requires_map_code: null,
    description: null,
    grid_rows: 21,
    grid_cols: 21,
    background_key: null,
  } satisfies MapRow;
  /** 第二张图：要求前置地图 map_qingyun 的 chapter_to（= 2）已完成。 */
  const SECOND_MAP = {
    id: 2,
    code: 'map_second',
    name: '下一张图',
    world: 'world_qingyun',
    order_index: 2,
    chapter_from: 3,
    chapter_to: 3,
    requires_map_code: 'map_qingyun',
    description: null,
    grid_rows: 21,
    grid_cols: 21,
    background_key: null,
  } satisfies MapRow;

  test('纯规则：无前置=解锁；前置章节未完成=锁定；已完成=解锁', () => {
    const maps = [FIRST_MAP, SECOND_MAP];
    assert.deepStrictEqual(
      [...unlockedMapCodes(maps, new Set<number>())].sort(),
      ['map_qingyun'],
      '入口图应解锁，链式图在章节未完成时应锁定',
    );
    assert.deepStrictEqual(
      [...unlockedMapCodes(maps, new Set([2]))].sort(),
      ['map_qingyun', 'map_second'],
      '完成前置图的 chapter_to（2）后应解锁下一张图',
    );
    assert.deepStrictEqual(
      [...unlockedMapCodes(maps, new Set([1]))],
      ['map_qingyun'],
      '完成的是 chapter_from 而不是 chapter_to 时不应解锁（闸门看的是前置图最后一章）',
    );
  });

  test('纯规则：前置地图不存在（配置错误）时永不解锁，而不是放行', () => {
    const orphan = { ...SECOND_MAP, requires_map_code: 'map_nowhere' };
    assert.deepStrictEqual(
      [...unlockedMapCodes([FIRST_MAP, orphan], new Set([2]))].sort(),
      ['map_qingyun'],
    );
  });

  test('纯规则：链式推进（图3 要求图2、图2 要求图1）逐级解锁', () => {
    const third = { ...SECOND_MAP, id: 3, code: 'map_third', order_index: 3, chapter_from: 4, chapter_to: 4, requires_map_code: 'map_second' } satisfies MapRow;
    const maps = [FIRST_MAP, SECOND_MAP, third];
    assert.deepStrictEqual([...unlockedMapCodes(maps, new Set([2]))].sort(), ['map_qingyun', 'map_second']);
    assert.deepStrictEqual(
      [...unlockedMapCodes(maps, new Set([2, 3]))].sort(),
      ['map_qingyun', 'map_second', 'map_third'],
    );
  });

  test('服务级：未解锁的地图不出现在 panel() 下发结果里', async () => {
    const { db } = mapDb({ maps: [FIRST_MAP, SECOND_MAP], completedChapters: [] });
    const { svc } = makeService({ db });

    const result = await svc.panel(7);

    assert.strictEqual(result.success, true);
    const data = result.data as { total: number; maps: Array<{ code: string }> };
    assert.strictEqual(data.total, 1, 'total 应只数已解锁地图');
    assert.deepStrictEqual(data.maps.map((m) => m.code), ['map_qingyun']);
  });

  test('服务级：前置章节完成后，下一张图出现（且节点边界照旧只下发已发现的）', async () => {
    const { db } = mapDb({ maps: [FIRST_MAP, SECOND_MAP], completedChapters: [2] });
    const { svc } = makeService({ db });

    const result = await svc.panel(7);

    const data = result.data as { total: number; maps: Array<{ code: string }> };
    assert.strictEqual(data.total, 2);
    assert.deepStrictEqual(data.maps.map((m) => m.code).sort(), ['map_qingyun', 'map_second']);
  });
});
