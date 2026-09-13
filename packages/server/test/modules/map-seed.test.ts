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
  minRealm?: number;
}

interface NodeSeed {
  code: string;
  mapCode: string;
  name: string;
  ring: string;
  sector?: string | null;
  kind: string;
  featureKey?: string | null;
  level: number;
  threshold: number;
  minRealm?: number;
  hasWaypoint?: boolean;
  chapter: number;
  requiresNodeCode?: string | null;
  zoneCode?: string | null;
  unitCode?: string | null;
  orderIndex: number;
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
const zones = loadJson<ZoneSeed[]>('zones.json');
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

  test('D3 保底：每张地图至少一个挂机点，否则「没时间上线也有得挂」不成立', () => {
    for (const map of maps) {
      const count = nodes.filter((n) => n.mapCode === map.code && n.kind === 'idle_spot').length;
      assert.ok(count >= 1, `地图 ${map.code} 没有挂机点`);
    }
  });

  test('D3 前提：挂机点必须声明刷什么单位，且非挂机点不得带单位', () => {
    for (const node of nodes) {
      if (node.kind === 'idle_spot') {
        assert.ok(node.unitCode != null, `挂机点 ${node.code} 未声明产出单位，服务端无从结算`);
      } else {
        assert.ok(node.unitCode == null, `非挂机点 ${node.code} 不应带 unitCode（${node.unitCode}）`);
      }
    }
  });

  test('D3 前提：挂机点刷的单位必须存在、可击杀、且产灵韵', () => {
    for (const node of nodes.filter((n) => n.kind === 'idle_spot')) {
      const unit = unitByCode.get(node.unitCode ?? '');
      assert.ok(unit !== undefined, `挂机点 ${node.code} 指向不存在的单位 ${node.unitCode}`);
      // 「挂机点刷友好 NPC」是最容易犯的配置错：这里必须拦住
      assert.strictEqual(unit?.camp, 'hostile', `挂机点 ${node.code} 刷的是 ${unit?.camp} 单位（${unit?.code}）`);
      assert.strictEqual(unit?.givesLingyun, true, `挂机点 ${node.code} 的单位 ${unit?.code} 不产灵韵`);
      assert.ok(unit?.dropTable != null, `挂机点 ${node.code} 的单位 ${unit?.code} 没有掉落表，挂机永远不产出物品`);
      // 单位境界应与节点等级同一档，否则挂机收益与难度不匹配
      assert.ok(
        Math.abs((unit?.realm ?? 0) - node.level) <= 1,
        `挂机点 ${node.code} 的等级 ${node.level} 与单位境界 ${unit?.realm} 相差过大`,
      );
    }
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

  test('境界与战力区间合法（境界 1~14；minRealm ≤ level；threshold > 0）', () => {
    for (const node of nodes) {
      assert.ok(Number.isInteger(node.level) && node.level >= 1 && node.level <= 14, `节点 ${node.code} 的 level 越界：${node.level}`);
      assert.ok(node.threshold > 0, `节点 ${node.code} 的 threshold 必须为正：${node.threshold}`);
      const minRealm = node.minRealm ?? 1;
      assert.ok(minRealm >= 1 && minRealm <= 14, `节点 ${node.code} 的 minRealm 越界：${minRealm}`);
      assert.ok(minRealm <= node.level, `节点 ${node.code} 的 minRealm(${minRealm}) 高于 level(${node.level})`);
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

  test('青云宗实践样板的结构特征（回归护栏：27 节点 / 7 传送点 / 3 挂机点 / 1 秘境）', () => {
    const qingyun = nodes.filter((n) => n.mapCode === 'map_qingyun');
    assert.strictEqual(qingyun.length, 27, '青云宗节点数变化了 —— 若是有意调整，请同步 §7.4 的节点表');
    assert.strictEqual(qingyun.filter((n) => n.hasWaypoint === true).length, 7);
    assert.strictEqual(qingyun.filter((n) => n.kind === 'idle_spot').length, 3);
    assert.strictEqual(qingyun.filter((n) => n.kind === 'secret_realm').length, 1);
    // 八峰：七职业峰 + 一历练秘境峰（用户构想的核心结构特征）
    const peaks = qingyun.filter((n) => n.ring === 'peaks');
    assert.strictEqual(peaks.length, 8);
    assert.strictEqual(peaks.filter((n) => n.featureKey === 'profession').length, 7);
  });
});
