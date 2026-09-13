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
  hasWaypoint?: boolean;
  chapter: number;
  requiresNodeCode?: string | null;
  zoneCode?: string | null;
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
   * 用户设定：青云宗这张图把玩家**历练到第五境**。
   * 因此全图怪物境界 ≤ 5，门槛也必须落在 1~5 境的可达范围内
   * （5 境裸装战力 = 5×20 = 100；门槛高过它就等于这张图自己把自己锁死）。
   */
  test('本图历练到第五境：怪物境界 ≤ 5，且门槛不超 5 境裸装战力（100）', () => {
    const overLevel = nodes.filter((n) => n.level > 5).map((n) => n.code);
    assert.deepStrictEqual(overLevel, [], `怪物境界超过第五境：${overLevel.join(', ')}`);
    const overGate = nodes.filter((n) => n.threshold > 100).map((n) => n.code);
    assert.deepStrictEqual(overGate, [], `门槛超过 5 境裸装战力（100）：${overGate.join(', ')}`);
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

  test('境界与战力区间合法（境界 1~14；threshold > 0）', () => {
    for (const node of nodes) {
      assert.ok(
        Number.isInteger(node.level) && node.level >= 1 && node.level <= 14,
        `节点 ${node.code} 的 level 越界：${node.level}`,
      );
      assert.ok(node.threshold > 0, `节点 ${node.code} 的 threshold 必须为正：${node.threshold}`);
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

  test('青云宗实践样板的结构特征（回归护栏：27 节点 / 7 传送点 / 1 历练秘境峰）', () => {
    const qingyun = nodes.filter((n) => n.mapCode === 'map_qingyun');
    assert.strictEqual(qingyun.length, 27, '青云宗节点数变化了 —— 若是有意调整，请同步 §7.4 的节点表');
    assert.strictEqual(qingyun.filter((n) => n.hasWaypoint === true).length, 7);
    // 挂机只能在历练秘境峰 → 全图只有 1 个秘境、0 个挂机点
    assert.strictEqual(qingyun.filter((n) => n.kind === 'idle_spot').length, 0);
    assert.strictEqual(qingyun.filter((n) => n.kind === 'secret_realm').length, 1);
    // 八峰：七职业峰 + 一历练秘境峰（用户构想的核心结构特征）
    const peaks = qingyun.filter((n) => n.ring === 'peaks');
    assert.strictEqual(peaks.length, 8);
    assert.strictEqual(peaks.filter((n) => n.featureKey === 'profession').length, 7);
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
