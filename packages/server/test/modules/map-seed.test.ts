/**
 * 地图种子不变量（纯配置 lint，不连数据库）。
 *
 * 为什么需要：地图层是**数据驱动**的，`map-nodes.json` / `map-edges.json` 是手写/生成的配置。
 * 一个写错的 code、一条断掉的边、一个 4 层的秘境，**不会在编译期暴露**，
 * 只会在玩家点进去时才炸（或更糟：悄悄地让某张图不可达）。
 * 因此把 R2 §5/§7 的硬规则固化成断言，后续地图（山下凡尘 / 混沌裂隙）直接受同一套约束。
 *
 * 覆盖的规则分三类：
 * 1. **引用完整性**：节点↔地图↔秘境↔边 的悬空引用（与建库脚本里的自检同口径）；
 * 2. **R2 已拍板的硬规则**：D8（每图 0~1 秘境、秘境 ≤3 层）、D2 的前提（秘境要指向真实 zone）、
 *    D3 的保底（每图至少一个挂机点）、§5.2（每图至少一个传送点，否则传送体系形同虚设）；
 * 3. **结构与数值自洽**：枚举合法、战力/境界区间、环层与章节一致、解锁链无环且全可达。
 *
 * 口径说明：**只固化「已拍板的硬规则」**，不把 §5.7 里的「建议值」（如节点规模 8~15）写成断言 ——
 * 否则调内容时会一路打红，测试会失去信号价值。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  angularDistance,
  angleOf,
  centerOf,
  checkEdgeStructure,
  deriveEdges,
  nearestIn,
} from '../../scripts/lib/map-edges.mjs';

const SEED_DIR = new URL('../../prisma/seeds/game/', import.meta.url);

interface MapSeed {
  id: number;
  code: string;
  name: string;
  world?: string;
  orderIndex: number;
  chapterFrom: number;
  chapterTo: number;
  requiresMapCode?: string | null;
  /** P1 画布坐标空间（交叉线条数 = gridRows + 1） */
  gridRows?: number;
  gridCols?: number;
  /** 底图资源 key：本轮恒为 null（P4 才填） */
  backgroundKey?: string | null;
}

interface NodeSeed {
  code: string;
  mapCode: string;
  name: string;
  ring: string;
  sector?: string | null;
  kind: string;
  featureKey?: string | null;
  /**
   * 怪物境界 / 门槛：**只有 `kind === 'secret_realm'` 的节点有值**，其余为 `null`
   * （2026-09-14 用户判定「宗门内总不能天天杀同门」）。
   */
  level: number | null;
  threshold: number | null;
  hasWaypoint?: boolean;
  chapter: number;
  requiresNodeCode?: string | null;
  zoneCode?: string | null;
  orderIndex: number;
  /** P1 画布：0-based 交叉线索引（`0..gridRows` / `0..gridCols`） */
  gridRow?: number;
  gridCol?: number;
  /** 风味文案（悬停卡 / 右栏详情） */
  description?: string | null;
}

interface EdgeSeed {
  id: number;
  mapCode: string;
  fromNodeCode: string;
  toNodeCode: string;
  bidirectional?: boolean;
}

interface ZoneSeed {
  id: number;
  code: string;
  name: string;
  maxFloor: number;
  bossEveryFloors?: number;
  unitCode?: string;
  bossCode?: string;
}

interface UnitSeed {
  code: string;
  name: string;
  realm: number;
  camp: string;
  givesLingyun: boolean;
  dropTable?: string | null;
}

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(new URL(file, SEED_DIR), 'utf8')) as T;
}

const maps = loadJson<MapSeed[]>('maps.json');
const nodes = loadJson<NodeSeed[]>('map-nodes.json');
const edges = loadJson<EdgeSeed[]>('map-edges.json');
const zonesRaw = loadJson<ZoneSeed[]>('zones.json');
const zones = zonesRaw;
const units = loadJson<UnitSeed[]>('unit-templates.json');

const nodeByCode = new Map(nodes.map((n) => [n.code, n]));
const mapByCode = new Map(maps.map((m) => [m.code, m]));
const zoneByCode = new Map(zones.map((z) => [z.code, z]));
const unitByCode = new Map(units.map((u) => [u.code, u]));

const RINGS = new Set(['outer', 'approach', 'peaks', 'inner', 'summit']);
const KINDS = new Set(['route', 'idle_spot', 'secret_realm', 'summit']);
const SECTORS = new Set(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);

describe('地图种子 · 引用完整性', () => {
  test('节点/边的 code 不重复', () => {
    assert.strictEqual(new Set(nodes.map((n) => n.code)).size, nodes.length, '节点 code 有重复');
    assert.strictEqual(new Set(maps.map((m) => m.code)).size, maps.length, '地图 code 有重复');
    assert.strictEqual(
      new Set(edges.map((e) => `${e.mapCode}:${e.fromNodeCode}->${e.toNodeCode}`)).size,
      edges.length,
      '同一条边有重复定义',
    );
  });

  test('每个节点都属于一张已定义的地图', () => {
    for (const node of nodes) {
      assert.ok(mapByCode.has(node.mapCode), `节点 ${node.code} 指向未定义地图 ${node.mapCode}`);
    }
  });

  test('requires_node_code 必须指向已定义节点', () => {
    for (const node of nodes) {
      if (node.requiresNodeCode == null) continue;
      assert.ok(
        nodeByCode.has(node.requiresNodeCode),
        `节点 ${node.code} 的前置 ${node.requiresNodeCode} 未定义`,
      );
    }
  });

  test('秘境节点必须指向真实存在的 zone，且非秘境节点不得带 zoneCode', () => {
    for (const node of nodes) {
      if (node.kind === 'secret_realm') {
        assert.ok(node.zoneCode != null, `秘境节点 ${node.code} 未关联 zone`);
        assert.ok(zoneByCode.has(node.zoneCode), `秘境节点 ${node.code} 指向不存在的 zone ${node.zoneCode}`);
      } else {
        assert.ok(node.zoneCode == null, `非秘境节点 ${node.code} 不应关联 zone（${node.zoneCode}）`);
      }
    }
  });

  test('边的两端必须存在，且属于同一条边声明的地图', () => {
    for (const edge of edges) {
      const from = nodeByCode.get(edge.fromNodeCode);
      const to = nodeByCode.get(edge.toNodeCode);
      assert.ok(from !== undefined, `边 ${edge.id} 的起点 ${edge.fromNodeCode} 不存在`);
      assert.ok(to !== undefined, `边 ${edge.id} 的终点 ${edge.toNodeCode} 不存在`);
      assert.notStrictEqual(edge.fromNodeCode, edge.toNodeCode, `边 ${edge.id} 是自环`);
      assert.strictEqual(from?.mapCode, edge.mapCode, `边 ${edge.id} 的 mapCode 与起点不一致`);
      assert.strictEqual(to?.mapCode, edge.mapCode, `边 ${edge.id} 的 mapCode 与终点不一致`);
    }
  });

  test('地图的 requires_map_code 必须指向已定义地图，且不指向自己', () => {
    for (const map of maps) {
      if (map.requiresMapCode == null) continue;
      assert.ok(mapByCode.has(map.requiresMapCode), `地图 ${map.code} 指向未定义地图 ${map.requiresMapCode}`);
      assert.notStrictEqual(map.requiresMapCode, map.code, `地图 ${map.code} 不能以自己为前置`);
    }
  });
});

describe('地图种子 · R2 已拍板硬规则', () => {
  test('D8：每张地图 0~1 个秘境', () => {
    for (const map of maps) {
      const count = nodes.filter((n) => n.mapCode === map.code && n.kind === 'secret_realm').length;
      assert.ok(count <= 1, `地图 ${map.code} 有 ${count} 个秘境（D8 上限 1）`);
    }
  });

  test('D8：大世界内秘境最多 3 层', () => {
    for (const map of maps) {
      if ((map.world ?? 'great') !== 'great') continue; // 异界（混沌海）本轮留空，不约束
      for (const node of nodes.filter((n) => n.mapCode === map.code && n.kind === 'secret_realm')) {
        const zone = zoneByCode.get(node.zoneCode ?? '');
        assert.ok(zone !== undefined, `秘境节点 ${node.code} 的 zone 缺失`);
        assert.ok(
          (zone?.maxFloor ?? 0) <= 3,
          `秘境 ${zone?.code} 有 ${zone?.maxFloor} 层，超出 D8 的 3 层上限`,
        );
      }
    }
  });

  test('D2 前提：秘境必须有 Boss 层设定，否则「击败首个 Boss 才解锁挂机」无法成立', () => {
    for (const map of maps) {
      for (const node of nodes.filter((n) => n.mapCode === map.code && n.kind === 'secret_realm')) {
        const zone = zoneByCode.get(node.zoneCode ?? '');
        assert.ok((zone?.bossEveryFloors ?? 0) > 0, `秘境 ${zone?.code} 的 bossEveryFloors 必须 > 0`);
        assert.ok(
          (zone?.bossEveryFloors ?? 0) <= (zone?.maxFloor ?? 0),
          `秘境 ${zone?.code} 的 Boss 间隔大于总层数，永远打不到 Boss`,
        );
      }
    }
  });

  /**
   * 用户修正：**挂机只能在「历练秘境峰」** —— 地图上不散布挂机点。
   * 因此 `kind` 只有 route / secret_realm / summit，且「能挂机的地方」就是秘境本身
   * （击败首个 Boss 后解锁离线挂机，D2）。这条断言防止后续地图定义时又把 idle_spot 加回来。
   */
  test('挂机只能在历练秘境峰：不得存在 idle_spot 节点', () => {
    const bad = nodes.filter((n) => n.kind === 'idle_spot').map((n) => n.code);
    assert.deepStrictEqual(bad, [], `不允许散布挂机点（挂机只能在历练秘境峰）：${bad.join(', ')}`);
  });

  test('地图节点不得自带产出单位（秘境产出由 game_zones.unit_code 决定）', () => {
    for (const node of nodes) {
      assert.ok(!('unitCode' in node), `节点 ${node.code} 不应带 unitCode`);
    }
  });

  test('历练秘境峰（唯一秘境）必须指向真实 zone，且该 zone 声明了刷什么单位与 Boss', () => {
    for (const node of nodes.filter((n) => n.kind === 'secret_realm')) {
      const zone = zoneByCode.get(node.zoneCode ?? '');
      assert.ok(zone !== undefined, `秘境节点 ${node.code} 的 zone 缺失`);
      const raw = zonesRaw.find((z) => z.code === node.zoneCode);
      assert.ok(raw !== undefined && raw.unitCode != null, `秘境 ${node.zoneCode} 未声明 unitCode（挂机无从结算）`);
      assert.ok(raw !== undefined && raw.bossCode != null, `秘境 ${node.zoneCode} 未声明 bossCode（D2 无从解锁）`);
      const unit = unitByCode.get(raw?.unitCode ?? '');
      assert.strictEqual(unit?.camp, 'hostile', `秘境 ${node.zoneCode} 刷的不是敌对单位`);
      assert.ok((unit?.realm ?? 99) <= 5, `秘境 ${node.zoneCode} 的单位境界超过本图上限（第五境）`);
    }
  });

  /**
   * 用户设定（D10 修正版）：**青云宗·历练峰**把玩家历练到第五境 —— 不是全图每个点都是怪。
   * 只有秘境节点带怪物境界 / 门槛，且境界 ≤ 5、门槛 ≤ 100（5 境裸装战力 = 100）。
   */
  test('青云宗·历练峰历练到第五境：秘境怪物境界 ≤ 5，且门槛不超 5 境裸装战力（100）', () => {
    const combat = nodes.filter((n) => n.level !== null);
    assert.deepStrictEqual(
      combat.filter((n) => !(n.level! >= 1 && n.level! <= 5)).map((n) => n.code),
      [],
      '秘境怪物境界必须落在 1~5 境',
    );
    const overGate = combat.filter((n) => !(n.threshold! > 0 && n.threshold! <= 100)).map((n) => n.code);
    assert.deepStrictEqual(overGate, [], `门槛必须落在 1~100（5 境裸装战力）`);
  });

  test('数据分层：level / threshold 只属于秘境节点，职能型枢纽必须为 null', () => {
    const withData = nodes.filter((n) => n.level !== null || n.threshold !== null);
    for (const node of withData) {
      assert.strictEqual(node.kind, 'secret_realm', `非秘境节点 ${node.code} 不得带怪物数据`);
    }
    // level 与 threshold 必须成对出现（有境界没门槛 = 半截战斗数据）
    for (const node of nodes) {
      assert.strictEqual(
        node.level === null,
        node.threshold === null,
        `节点 ${node.code} 的 level / threshold 必须同时为空或同时有值`,
      );
    }
    // 反向：秘境必须带数据
    for (const node of nodes.filter((n) => n.kind === 'secret_realm')) {
      assert.ok(node.level !== null && node.threshold !== null, `秘境节点 ${node.code} 缺怪物数据`);
    }
    // 记录当前分层规模（防回归：宗门 16 个枢纽必须全部为 null）
    assert.strictEqual(withData.length, 1, '本轮只有历练峰一个节点带怪物数据');
  });

  test('§5.2：每张地图至少一个传送点，否则传送体系形同虚设', () => {
    for (const map of maps) {
      const count = nodes.filter((n) => n.mapCode === map.code && n.hasWaypoint === true).length;
      assert.ok(count >= 1, `地图 ${map.code} 没有任何传送点`);
    }
  });
});

describe('地图种子 · 结构与数值自洽', () => {
  test('ring / kind / sector 取值合法', () => {
    for (const node of nodes) {
      assert.ok(RINGS.has(node.ring), `节点 ${node.code} 的 ring 非法：${node.ring}`);
      assert.ok(KINDS.has(node.kind), `节点 ${node.code} 的 kind 非法：${node.kind}`);
      if (node.sector != null) {
        assert.ok(SECTORS.has(node.sector), `节点 ${node.code} 的 sector 非法：${node.sector}`);
      }
    }
  });

  test('境界与战力区间合法（境界 1~14；threshold > 0）—— 仅秘境节点受约束', () => {
    for (const node of nodes.filter((n) => n.kind === 'secret_realm')) {
      assert.ok(
        Number.isInteger(node.level) && (node.level ?? 0) >= 1 && (node.level ?? 0) <= 14,
        `秘境节点 ${node.code} 的 level 越界：${node.level}`,
      );
      assert.ok((node.threshold ?? 0) > 0, `秘境节点 ${node.code} 的 threshold 必须为正：${node.threshold}`);
    }
    for (const node of nodes.filter((n) => n.kind !== 'secret_realm')) {
      assert.strictEqual(node.level, null, `职能型枢纽 ${node.code} 的 level 必须为 null`);
      assert.strictEqual(node.threshold, null, `职能型枢纽 ${node.code} 的 threshold 必须为 null`);
    }
  });

  /**
   * 地图与节点**都不带境界闸门**，这是刻意的：
   * 地图由剧情解锁（D4），节点由 `threshold` 做确定性检定（§6.1）。
   * 若再加一道 `minRealm`，既与设计不符（§7.4 的节点表没有这一列），
   * 又会挡住「装备够就允许越级打」的意图（§6.2：战力溢出本身就是追求）。
   * 这条断言防止后续地图定义时把这个字段又加回来。
   */
  test('地图与节点都不得引入境界闸门字段（越级打是设计意图，不是漏洞）', () => {
    for (const map of maps) {
      assert.ok(!('minRealm' in map), `地图 ${map.code} 不应有 minRealm：地图闸门是剧情（D4）`);
    }
    for (const node of nodes) {
      assert.ok(!('minRealm' in node), `节点 ${node.code} 不应有 minRealm：闸门是 threshold（§6）`);
    }
  });

  test('地图章节区间自洽，且每个节点的章节落在所属地图区间内', () => {
    for (const map of maps) {
      assert.ok(map.chapterFrom <= map.chapterTo, `地图 ${map.code} 的章节区间反转`);
    }
    for (const node of nodes) {
      const map = mapByCode.get(node.mapCode);
      assert.ok(
        node.chapter >= (map?.chapterFrom ?? 0) && node.chapter <= (map?.chapterTo ?? 0),
        `节点 ${node.code} 的章节 ${node.chapter} 不在地图 ${node.mapCode} 的 [${map?.chapterFrom},${map?.chapterTo}] 内`,
      );
    }
  });

  test('同一地图内 orderIndex 不重复', () => {
    for (const map of maps) {
      const list = nodes.filter((n) => n.mapCode === map.code).map((n) => n.orderIndex);
      assert.strictEqual(new Set(list).size, list.length, `地图 ${map.code} 的 orderIndex 有重复`);
    }
  });

  test('解锁链无环（沿 requires_node_code 回溯必然终止）', () => {
    for (const node of nodes) {
      const seen = new Set<string>([node.code]);
      let cursor = node.requiresNodeCode ?? null;
      while (cursor != null) {
        assert.ok(!seen.has(cursor), `节点 ${node.code} 的前置链出现环（回到 ${cursor}）`);
        seen.add(cursor);
        cursor = nodeByCode.get(cursor)?.requiresNodeCode ?? null;
      }
    }
  });

  test('全图可达：从无前置的入口节点出发，沿边能走到每一个节点', () => {
    const adjacency = new Map<string, string[]>();
    for (const node of nodes) adjacency.set(node.code, []);
    for (const edge of edges) {
      adjacency.get(edge.fromNodeCode)?.push(edge.toNodeCode);
      if (edge.bidirectional !== false) adjacency.get(edge.toNodeCode)?.push(edge.fromNodeCode);
    }
    for (const map of maps) {
      const inMap = nodes.filter((n) => n.mapCode === map.code);
      const entries = inMap.filter((n) => n.requiresNodeCode == null).map((n) => n.code);
      assert.ok(entries.length > 0, `地图 ${map.code} 没有入口节点（所有节点都要求前置）`);
      const reached = new Set<string>(entries);
      const queue = [...entries];
      while (queue.length > 0) {
        const current = queue.shift() as string;
        for (const next of adjacency.get(current) ?? []) {
          if (reached.has(next)) continue;
          reached.add(next);
          queue.push(next);
        }
      }
      const unreachable = inMap.filter((n) => !reached.has(n.code)).map((n) => n.code);
      assert.deepStrictEqual(unreachable, [], `地图 ${map.code} 有不可达节点：${unreachable.join(', ')}`);
    }
  });

  test('青云宗实践样板的结构特征（回归护栏：17 枢纽 / 4 传送点 / 1 历练秘境峰）', () => {
    const qingyun = nodes.filter((n) => n.mapCode === 'map_qingyun');
    assert.strictEqual(qingyun.length, 17, '青云宗节点数变化了 —— 若是有意调整，请同步任务书 §0 的结构表');
    assert.strictEqual(
      qingyun.filter((n) => n.hasWaypoint === true).length,
      4,
      '只有四门挂传送点（相邻可直达，传送点是最外的兜底）',
    );
    // 挂机只能在历练秘境峰 → 全图只有 1 个秘境、0 个挂机点
    assert.strictEqual(qingyun.filter((n) => n.kind === 'idle_spot').length, 0);
    assert.strictEqual(qingyun.filter((n) => n.kind === 'secret_realm').length, 1);
    // 结构：四门 4 + 八峰 8（七职业峰 + 一历练秘境峰）+ 四院 4 + 主峰 1
    assert.strictEqual(qingyun.filter((n) => n.ring === 'outer').length, 4);
    const peaks = qingyun.filter((n) => n.ring === 'peaks');
    assert.strictEqual(peaks.length, 8);
    assert.strictEqual(peaks.filter((n) => n.featureKey === 'profession').length, 7);
    assert.strictEqual(qingyun.filter((n) => n.ring === 'inner').length, 4);
    assert.strictEqual(qingyun.filter((n) => n.ring === 'summit').length, 1);
    // 外门接引区已删除（用户拍板：天下第一宗门，只有下宗，不设外门）
    assert.ok(!qingyun.some((n) => n.ring === 'approach'), '不应再存在 approach 环层节点');
  });

  /**
   * 过渡态追踪（**等地图形 2/3 定义完就删掉这条**）。
   *
   * 地图层是新增的，而 `zones.json` 里的 5 个遗留秘境先于地图层存在、**没有对应地图节点**。
   * 后端的离线闸门必须对它们保持旧行为（否则会打断现有游戏），因此这个「未归属」集合
   * 是一份**需要被显式看见的迁移债**：把它写成断言，等某天它们被重新归属时，
   * 这条会失败并提醒「债还完了，可以去删闸门里的过渡分支」。
   */
  test('迁移债：未归属任何地图节点的遗留秘境 = 已知 5 个（清理后请删除本用例）', () => {
    const mapped = new Set(nodes.map((n) => n.zoneCode).filter((c): c is string => c != null));
    const orphans = zones.filter((z) => !mapped.has(z.code)).map((z) => z.code).sort();
    assert.deepStrictEqual(
      orphans,
      ['zone_dajie', 'zone_guhai', 'zone_hundun', 'zone_miwu', 'zone_qingyun'],
      '未归属地图的秘境集合变了 —— 若是已把遗留秘境接入地图，请同步删除后端闸门里的过渡分支与本用例',
    );
  });
});

// ===== 邻接表（P2.0 §4，32 条，可改的种子数据）=====

/** 无向邻接（`bidirectional !== false` 时两端都算）。 */
function adjacencyOfAll(): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.code, []);
  for (const edge of edges) {
    adjacency.get(edge.fromNodeCode)?.push(edge.toNodeCode);
    if (edge.bidirectional !== false) adjacency.get(edge.toNodeCode)?.push(edge.fromNodeCode);
  }
  return adjacency;
}

/** 从 `start` 出发的 BFS 可达集合。 */
function reachableFrom(start: string): Set<string> {
  const adjacency = adjacencyOfAll();
  const reached = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of adjacency.get(current) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return reached;
}

describe('地图邻接表 · 32 条（P2.0 §4）', () => {
  test('边数正好 32，无自环、无重复（无向去重）', () => {
    assert.strictEqual(edges.length, 32, '边数变化了 —— 若是有意调整请同步任务书 §4');
    const seen = new Set<string>();
    for (const e of edges) {
      assert.notStrictEqual(e.fromNodeCode, e.toNodeCode, `边 ${e.id} 是自环`);
      const key = [e.fromNodeCode, e.toNodeCode].sort().join('|');
      assert.ok(!seen.has(key), `无向边重复：${e.fromNodeCode} ↔ ${e.toNodeCode}`);
      seen.add(key);
    }
  });

  test('分组计数：八峰环 8 / 山门接两邻峰 8 / 峰→院 8 / 四院环 4 / 四院→主峰 4', () => {
    const set = new Set(edges.map((e) => [e.fromNodeCode, e.toNodeCode].sort().join('|')));
    const has = (a: string, b: string) => set.has([a, b].sort().join('|'));
    const peaks = ['qy_peak_1', 'qy_peak_2', 'qy_peak_3', 'qy_peak_4', 'qy_peak_5', 'qy_peak_6', 'qy_peak_7', 'qy_peak_xunlian'];
    // 八峰环：每个峰恰好与环上两个峰相邻
    for (const peak of peaks) {
      const ringNeighbors = peaks.filter((other) => other !== peak && has(peak, other));
      assert.strictEqual(ringNeighbors.length, 2, `${peak} 的八峰环邻居应为 2 个`);
    }
    // 山门接两邻峰
    const gatePeaks: [string, string[]][] = [
      ['qy_gate_n', ['qy_peak_1', 'qy_peak_xunlian']],
      ['qy_gate_e', ['qy_peak_7', 'qy_peak_6']],
      ['qy_gate_s', ['qy_peak_5', 'qy_peak_4']],
      ['qy_gate_w', ['qy_peak_2', 'qy_peak_3']],
    ];
    for (const [gate, list] of gatePeaks) {
      for (const peak of list) assert.ok(has(gate, peak), `${gate} 应接 ${peak}`);
    }
    // 峰→院：内环的唯一入口（每个院恰好 2 个峰）
    const halls = ['qy_chuanfayuan', 'qy_yulingyuan', 'qy_baigongyuan', 'qy_zhifayuan'];
    for (const hall of halls) {
      const peaksToHall = peaks.filter((peak) => has(peak, hall));
      assert.strictEqual(peaksToHall.length, 2, `${hall} 应由恰好 2 个峰接入（内环唯一入口）`);
      assert.ok(has(hall, 'qy_summit'), `${hall} 应放射到青云主峰`);
    }
    // 四院环
    assert.ok(has('qy_chuanfayuan', 'qy_yulingyuan'));
    assert.ok(has('qy_yulingyuan', 'qy_baigongyuan'));
    assert.ok(has('qy_baigongyuan', 'qy_zhifayuan'));
    assert.ok(has('qy_zhifayuan', 'qy_chuanfayuan'));
  });

  test('从北门出发能走遍全部 17 个节点（八峰环 + 峰→院 + 院→主峰必须真接通）', () => {
    const reached = reachableFrom('qy_gate_n');
    const unreachable = nodes.filter((n) => !reached.has(n.code)).map((n) => n.code);
    assert.deepStrictEqual(unreachable, [], `从北门出发不可达：${unreachable.join(', ')}`);
    assert.strictEqual(reached.size, 17);
  });

  test('每个节点至少有一条边（无孤岛）', () => {
    const adjacency = adjacencyOfAll();
    for (const node of nodes) {
      assert.ok((adjacency.get(node.code) ?? []).length > 0, `${node.code} 是孤岛（没有任何邻接）`);
    }
  });
});

// ===== 边表几何派生（P2.0 v3 §4）=====

const seedCell = new Map(nodes.map((n) => [n.code, { row: n.gridRow as number, col: n.gridCol as number }]));
const seedCenter = centerOf(seedCell, nodes);
const seedAngle = new Map(nodes.map((n) => [n.code, angleOf(seedCell, n.code, seedCenter)]));
const peakNodes = nodes.filter((n) => n.ring === 'peaks');
const hallNodes = nodes.filter((n) => n.ring === 'inner');

describe('边表几何派生 deriveEdges（P2.0 v3 §4.1）', () => {
  test('输出 32 条，且与种子 map-edges.json 完全一致（画出来的线 ≡ 可走的路 ≡ 边表）', () => {
    const derived = deriveEdges(seedCell, nodes);
    assert.strictEqual(derived.length, 32);
    const keys = (list: Array<{ fromNodeCode: string; toNodeCode: string }>) =>
      new Set(list.map((e) => [e.fromNodeCode, e.toNodeCode].sort().join('|')));
    assert.deepStrictEqual(
      [...keys(derived)].sort(),
      [...keys(edges)].sort(),
      '种子边表与 deriveEdges 的输出不一致 —— 边表必须存派生结果，不得手写',
    );
  });

  test('确定性：同一组坐标重算两次结果完全相同', () => {
    assert.deepStrictEqual(deriveEdges(seedCell, nodes), deriveEdges(seedCell, nodes));
  });

  test('用户例子逐条复现：西门(180°) 最近 2 峰 = 第三峰/第二峰，二者最近院都是执法院', () => {
    const west = angleOf(seedCell, 'qy_gate_w', seedCenter);
    assert.ok(west !== null && Math.abs(west - 180) < 1e-6, `西门应在 180°：${west}`);
    const nearestPeaks = nearestIn(peakNodes, seedAngle, 'qy_gate_w', 2).map((n) => n.code).sort();
    assert.deepStrictEqual(nearestPeaks, ['qy_peak_2', 'qy_peak_3'], '西门最近 2 峰应为第二、第三峰');
    // 与规格给的理想角 157.5° / 202.5° 相差在落格吸附范围内（< 8°）
    assert.ok(angularDistance(seedAngle.get('qy_peak_3') as number, 157.5) < 8);
    assert.ok(angularDistance(seedAngle.get('qy_peak_2') as number, 202.5) < 8);
    for (const peak of ['qy_peak_2', 'qy_peak_3']) {
      const hall = nearestIn(hallNodes, seedAngle, peak, 1)[0]?.code;
      assert.strictEqual(hall, 'qy_zhifayuan', `${peak} 最近院应为执法院`);
    }
    // 边表里这两条边确实存在，且第二/第三峰各自只接执法院
    const has = (a: string, b: string) =>
      edges.some((e) => [e.fromNodeCode, e.toNodeCode].sort().join('|') === [a, b].sort().join('|'));
    assert.ok(has('qy_gate_w', 'qy_peak_2') && has('qy_gate_w', 'qy_peak_3'));
    assert.ok(has('qy_peak_2', 'qy_zhifayuan') && has('qy_peak_3', 'qy_zhifayuan'));
  });

  test('种子边表通过结构硬自检（同环角度相邻 / 相邻环角度最近，且派生边一条不少）', () => {
    assert.deepStrictEqual(checkEdgeStructure(edges, nodes, seedCell), []);
  });

  test('人为破坏一：跨环但非角度最近（西门 ↔ 第一峰）-> 必须硬失败', () => {
    const broken = [...edges, { fromNodeCode: 'qy_gate_w', toNodeCode: 'qy_peak_1' }];
    const failures = checkEdgeStructure(broken, nodes, seedCell);
    assert.ok(
      failures.some((f) => f.includes('结构非法') && f.includes('qy_gate_w')),
      `应报「结构非法」：${failures.join(' | ')}`,
    );
  });

  test('人为破坏二：同环但不相邻（第一峰 ↔ 第三峰）-> 必须硬失败', () => {
    const broken = [...edges, { fromNodeCode: 'qy_peak_1', toNodeCode: 'qy_peak_3' }];
    const failures = checkEdgeStructure(broken, nodes, seedCell);
    assert.ok(
      failures.some((f) => f.includes('结构非法') && f.includes('qy_peak_1')),
      `应报「结构非法」：${failures.join(' | ')}`,
    );
  });

  test('人为破坏三：删掉一条派生边 -> 必须报「缺少派生边」', () => {
    const broken = edges.filter((e) => !(e.fromNodeCode === 'qy_peak_2' && e.toNodeCode === 'qy_zhifayuan'));
    const failures = checkEdgeStructure(broken, nodes, seedCell);
    assert.ok(failures.some((f) => f.includes('缺少派生边')), failures.join(' | '));
  });

  test('人为破坏四：挪坐标让「最近院」换人 -> 原边立刻变成结构非法（防数据定义错位）', () => {
    // 把执法院从正西 (10,5) 挪到东南 (15,15)：第二峰(约203°)的最近院就不再是它，
    // 手写边表若不跟着改，结构自检必须抓到
    const moved = new Map(seedCell);
    moved.set('qy_zhifayuan', { row: 15, col: 15 });
    const failures = checkEdgeStructure(edges, nodes, moved);
    assert.ok(failures.length > 0, '坐标漂移后旧边表必须被判非法');
  });
});

// ===== 对象层（P2.0 §3）：一院多职能的明细 =====

interface MapObjectSeed {
  code: string;
  mapCode: string;
  nodeCode: string;
  kind: string;
  name: string;
  featureKey?: string | null;
  description?: string | null;
  orderIndex: number;
}

const objects = loadJson<MapObjectSeed[]>('map-objects.json');

describe('地图对象种子 · 一院多职能（P2.0 §3）', () => {
  test('11 个对象（四院 ×2 + 主峰 ×3），code 不重复，kind 只有 office', () => {
    assert.strictEqual(objects.length, 11, '对象数变化了 —— 若是有意调整请同步任务书 §3');
    assert.strictEqual(new Set(objects.map((o) => o.code)).size, objects.length, '对象 code 有重复');
    for (const o of objects) {
      assert.strictEqual(o.kind, 'office', `本轮对象只有 office 一种类型：${o.code}=${o.kind}`);
    }
  });

  test('每个对象都挂在已定义节点上，且宿主只能是四院或主峰', () => {
    const hosts = new Set(['qy_chuanfayuan', 'qy_yulingyuan', 'qy_baigongyuan', 'qy_zhifayuan', 'qy_summit']);
    for (const o of objects) {
      assert.ok(nodeByCode.has(o.nodeCode), `对象 ${o.code} 的宿主 ${o.nodeCode} 不存在`);
      assert.ok(hosts.has(o.nodeCode), `对象 ${o.code} 挂在了非四院/主峰的宿主上：${o.nodeCode}`);
      assert.ok(mapByCode.has(o.mapCode), `对象 ${o.code} 指向未定义地图 ${o.mapCode}`);
    }
  });

  test('每个对象的 featureKey 非空（§7：本轮 11 个对象都要能指向一个系统）', () => {
    for (const o of objects) {
      assert.ok(
        typeof o.featureKey === 'string' && o.featureKey.length > 0,
        `对象 ${o.code} 缺 featureKey`,
      );
    }
  });

  test('四院各 2 个职能、主峰 3 个；同一宿主内 orderIndex 不重复', () => {
    const byHost = new Map<string, MapObjectSeed[]>();
    for (const o of objects) {
      byHost.set(o.nodeCode, [...(byHost.get(o.nodeCode) ?? []), o]);
    }
    for (const host of ['qy_chuanfayuan', 'qy_yulingyuan', 'qy_baigongyuan', 'qy_zhifayuan']) {
      assert.strictEqual(byHost.get(host)?.length, 2, `${host} 应有 2 个职能入口`);
    }
    assert.strictEqual(byHost.get('qy_summit')?.length, 3, '主峰应有 3 个职能入口');
    for (const [host, list] of byHost) {
      const orders = list.map((o) => o.orderIndex);
      assert.strictEqual(new Set(orders).size, orders.length, `${host} 的 orderIndex 有重复`);
    }
  });

  test('每个对象都有非空风味文案（右栏列表不会开天窗）', () => {
    for (const o of objects) {
      assert.ok(
        typeof o.description === 'string' && o.description.trim().length > 0,
        `对象 ${o.code} 缺 description`,
      );
    }
  });
});
