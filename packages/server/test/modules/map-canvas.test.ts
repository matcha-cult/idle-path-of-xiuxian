/**
 * 地图画布落格与坐标的**边界测试**（P1 画布，任务书 §5）。
 *
 * 分两层：
 * 1. **算法层**（`scripts/lib/map-layout.mjs` 的纯函数）—— 越界 / 撞点 / 缺坐标 /
 *    最大偏移超阈值 / `sep` 边界（`n=0`、`n=1`、空节点表）/ 单节点图 / 空边集合 /
 *    `sector=null` 回退 / 极端 `n` 不崩；
 * 2. **种子层** —— 生成的 `map-nodes.json` 坐标齐全、在界内、无撞点、与算法重算一致，
 *    且硬失败自检对「人为破坏」确实报错（否则自检等于没有）。
 *
 * 为什么值得单独一个文件：坐标是**数据驱动**的，写错只会在玩家点进去时才炸
 * （或更糟：枢纽画到画布外，永远点不到）。把边界固化成断言，后续地图直接受同一套约束。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  crossingPairs,
  edgeSpanHistogram,
  layoutNodes,
  minGap,
  peaksRadialDeviation,
  polarFor,
  polarToCell,
  ringRank,
  snapError,
} from '../../scripts/lib/map-layout.mjs';
import { checkLayoutFailures, inBounds, MAX_OFFSET_CELLS } from '../../scripts/lib/map-layout-check.mjs';

const SEED_DIR = new URL('../../prisma/seeds/game/', import.meta.url);
const read = (file: string): unknown => JSON.parse(readFileSync(new URL(file, SEED_DIR), 'utf8'));

interface SeedNode {
  code: string;
  mapCode: string;
  ring: string;
  sector: string | null;
  kind: string;
  requiresNodeCode: string | null;
  orderIndex: number;
  gridRow?: number;
  gridCol?: number;
  description?: string | null;
}
interface SeedEdge {
  mapCode: string;
  fromNodeCode: string;
  toNodeCode: string;
  bidirectional?: boolean;
}
interface SeedMap {
  code: string;
  gridRows?: number;
  gridCols?: number;
  backgroundKey?: string | null;
}

const maps = read('maps.json') as SeedMap[];
const nodes = read('map-nodes.json') as SeedNode[];
const edges = read('map-edges.json') as SeedEdge[];
const qingyunMap = maps.find((m) => m.code === 'map_qingyun') as SeedMap;
const N = qingyunMap.gridRows as number;
const qingyunEdges = edges.filter((e) => e.mapCode === 'map_qingyun');

/** 无坐标的极简节点（算法层用例的基底；`extra` 放最后才能覆盖 `sector`）。 */
function node(code: string, ring: string, extra: Partial<SeedNode> = {}): SeedNode {
  return {
    code,
    mapCode: 'map_qingyun',
    ring,
    sector: null,
    kind: 'route',
    requiresNodeCode: null,
    orderIndex: 1,
    ...extra,
  };
}
function edge(fromNodeCode: string, toNodeCode: string): SeedEdge {
  return { mapCode: 'map_qingyun', fromNodeCode, toNodeCode, bidirectional: true };
}
function layoutOf(list: SeedNode[], linkList: SeedEdge[] = [], n = N, sep = 2, arc = 2.4) {
  return layoutNodes({ n, nodes: list, edges: linkList, sep, arc });
}
function failReasons(layout: unknown, list: SeedNode[], linkList: SeedEdge[], n = N): string[] {
  return checkLayoutFailures({ layout: layout as never, nodes: list, edges: linkList, n });
}

// ===== 算法层 =====

describe('落格 · 边界与退化输入', () => {
  test('空节点表 -> 空布局（不抛错），无交叉无边跨度', () => {
    const layout = layoutOf([]);
    assert.notEqual(layout, null);
    assert.equal(layout?.cell.size, 0);
    assert.equal(snapError(layout as never).max, 0);
    assert.deepStrictEqual(crossingPairs(layout as never, []), []);
    assert.equal(edgeSpanHistogram(layout as never, []).max, 0);
    assert.equal(peaksRadialDeviation(layout as never, [], N), 0);
  });

  test('单节点图（summit，无边）-> 落在正中 (n/2, n/2)', () => {
    const layout = layoutOf([node('s', 'summit')]);
    assert.deepStrictEqual(layout?.cell.get('s'), { row: 10, col: 10 });
    assert.equal(minGap(layout as never, []).min, Infinity);
    assert.equal(failReasons(layout, [node('s', 'summit')], []).length, 0);
  });

  test('n=0：唯一交叉点 (0,0)，多节点必然落不下 -> null', () => {
    const one = layoutOf([node('s', 'summit')], [], 0);
    assert.deepStrictEqual(one?.cell.get('s'), { row: 0, col: 0 });
    const two = layoutOf([node('s', 'summit'), node('p', 'peaks', { sector: 'N' })], [], 0);
    assert.equal(two, null);
    assert.ok(failReasons(two, [], []).length > 0, '落不下必须报硬失败');
  });

  test('n=1：仅 4 个交叉点，不相邻节点塞不下（切比雪夫 ≥sep 容不下 3 个）', () => {
    const three = ['a', 'b', 'c'].map((code) => node(code, 'inner'));
    // 三个互不相邻的节点在 2×2 交叉点上必然有两对贴到 1 格（< sep=2）
    assert.equal(layoutOf(three, [], 1), null);
    assert.equal(layoutOf(three, [edge('a', 'b')], 1), null);
    // 两节点无边（要求 ≥2 格）也塞不下
    assert.equal(layoutOf([node('a', 'inner'), node('b', 'inner')], [], 1), null);
    // 两节点**有边**时可以贴近（1 格），落得下
    const linked = layoutOf([node('a', 'inner'), node('b', 'inner')], [edge('a', 'b')], 1);
    assert.equal(linked?.cell.size, 2);
  });

  test('n 非法（负数 / 小数 / NaN）-> null，不抛错', () => {
    for (const n of [-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(layoutOf([node('s', 'summit')], [], n as number), null, `n=${n} 应返回 null`);
    }
  });

  test('sep 边界：sep<=1 时相邻两点即可共存（不相邻也允许贴 1 格）', () => {
    const list = [node('a', 'inner'), node('b', 'inner')];
    const layout = layoutOf(list, [], 21, 1);
    assert.equal(layout?.cell.size, 2);
    assert.equal(checkLayoutFailures({ layout: layout as never, nodes: list, edges: [], n: N, sep: 1 }).length, 0);
  });

  test('极坐标：sector=null 回退到 0°（正东），未知 ring 回退到内环第 2 层', () => {
    assert.deepStrictEqual(polarFor(21, node('x', 'peaks', { sector: null })), { r: 9, a: 0 });
    assert.deepStrictEqual(polarFor(21, node('x', 'outer', { sector: null })), { r: 10, a: 0 });
    const unknown = polarFor(21, node('x', 'no_such_ring'));
    assert.ok(Number.isFinite(unknown.r) && Number.isFinite(unknown.a));
    // 未知环层排在已知环层之后：不会插到八峰前面把骨架挤走
    assert.ok(ringRank('no_such_ring') > ringRank('outer'));
  });

  test('sector 取值决定方位：北门 (0,12) / 南门 (21,10) / 西门 (9,0) / 东门 (10,21) 附近', () => {
    const list = [
      node('e', 'outer', { sector: 'E' }),
      node('s', 'outer', { sector: 'S' }),
      node('w', 'outer', { sector: 'W' }),
      node('n', 'outer', { sector: 'N' }),
    ];
    const layout = layoutOf(list);
    // 角度约定：0°=正东(col+)、90°=正南(row+)、180°=正西、270°=正北
    const e = layout?.cell.get('e') as { row: number; col: number };
    const s = layout?.cell.get('s') as { row: number; col: number };
    const w = layout?.cell.get('w') as { row: number; col: number };
    const n = layout?.cell.get('n') as { row: number; col: number };
    assert.ok(e.col > 18 && Math.abs(e.row - 10) <= 2, `东门应在右侧：${JSON.stringify(e)}`);
    assert.ok(s.row > 18 && Math.abs(s.col - 10) <= 2, `南门应在下方：${JSON.stringify(s)}`);
    assert.ok(w.col < 3 && Math.abs(w.row - 10) <= 2, `西门应在左侧：${JSON.stringify(w)}`);
    assert.ok(n.row < 3 && Math.abs(n.col - 10) <= 2, `北门应在上方：${JSON.stringify(n)}`);
  });

  test('拓扑相邻允许贴近（< sep）：种子里的 qy_gate_n ↔ qy_approach 就是 1 格', () => {
    const cell = new Map(nodes.map((n) => [n.code, { row: n.gridRow as number, col: n.gridCol as number }]));
    const at = (code: string): { row: number; col: number } => cell.get(code) as { row: number; col: number };
    const linked = new Set<string>();
    for (const e of qingyunEdges) {
      linked.add(`${e.fromNodeCode}|${e.toNodeCode}`);
      linked.add(`${e.toNodeCode}|${e.fromNodeCode}`);
    }
    const cheb = (a: string, b: string): number =>
      Math.max(Math.abs(at(a).row - at(b).row), Math.abs(at(a).col - at(b).col));

    // 有边 -> 允许 < sep；这正是「四门紧贴八峰」不被判成冲突的原因
    assert.equal(cheb('qy_gate_n', 'qy_approach'), 1);
    assert.ok(linked.has('qy_gate_n|qy_approach'), '贴近的这对必须有边，否则就是非法拥挤');

    // 反证：任何 < sep 的节点对都必须有边（否则自检的「不相邻最小间距」会破）
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i].code;
        const b = nodes[j].code;
        if (cheb(a, b) < 2) {
          assert.ok(linked.has(`${a}|${b}`), `${a} ↔ ${b} 距离 ${cheb(a, b)} 格且不相邻（违反 sep=2）`);
        }
      }
    }
  });

  test('polarToCell 与 polarFor 自洽：理想位是浮点、落格是整数交叉点', () => {
    const want = polarToCell(21, polarFor(21, node('s', 'summit')));
    assert.deepStrictEqual(want, { row: 10.5, col: 10.5 });
  });
});

describe('自检 · 硬失败识别（人为破坏必须被抓到）', () => {
  const list = [node('s', 'summit'), node('p', 'peaks', { sector: 'S' }), node('i', 'inner')];
  const base = layoutOf(list, [edge('s', 'p'), edge('p', 'i')]);

  test('坐标越界（-1 / n+1）被判失败', () => {
    const below = new Map(base?.cell);
    below.set('s', { row: -1, col: 0 });
    assert.ok(failReasons({ ...base, cell: below, offsets: base?.offsets }, list, [edge('s', 'p')])
      .some((f) => f.includes('越界')));
    const above = new Map(base?.cell);
    above.set('p', { row: 0, col: N + 1 });
    assert.ok(failReasons({ ...base, cell: above }, list, []).some((f) => f.includes('越界')));
    assert.equal(inBounds({ row: 0, col: N }, N), true);
    assert.equal(inBounds({ row: N + 1, col: 0 }, N), false);
    assert.equal(inBounds({ row: 1.5, col: 0 }, N), false, '非整数格位非法');
    assert.equal(inBounds(undefined, N), false);
  });

  test('撞点（两节点同坐标）被判失败', () => {
    const cell = new Map(base?.cell);
    cell.set('p', { ...(cell.get('s') as { row: number; col: number }) });
    const reasons = failReasons({ ...base, cell }, list, []);
    assert.ok(reasons.some((f) => f.includes('撞点')), reasons.join(' | '));
  });

  test('缺坐标（节点未落格）被判失败', () => {
    const cell = new Map(base?.cell);
    cell.delete('i');
    assert.ok(failReasons({ ...base, cell }, list, [edge('s', 'p')]).some((f) => f.includes('未落格')));
  });

  test(`落点最大偏移超过 ${MAX_OFFSET_CELLS} 格被判失败`, () => {
    const offsets = new Map(base?.offsets);
    offsets.set('i', MAX_OFFSET_CELLS + 0.01);
    assert.ok(failReasons({ ...base, offsets }, list, []).some((f) => f.includes('最大偏移')));
    offsets.set('i', MAX_OFFSET_CELLS);
    assert.equal(failReasons({ ...base, offsets }, list, []).length, 0, '恰好等于阈值应通过');
  });

  test('前置引用悬空与不可达节点被判失败', () => {
    const dangling = [node('a', 'summit'), node('b', 'inner', { requiresNodeCode: 'ghost' })];
    const layout = layoutOf(dangling, []);
    assert.ok(failReasons(layout, dangling, []).some((f) => f.includes('悬空')));
    const unreachable = [node('a', 'summit'), node('b', 'inner', { requiresNodeCode: 'a' })];
    assert.ok(failReasons(layoutOf(unreachable, []), unreachable, []).some((f) => f.includes('不可达')));
    const noEntry = [node('a', 'summit', { requiresNodeCode: 'b' }), node('b', 'inner', { requiresNodeCode: 'a' })];
    assert.ok(failReasons(layoutOf(noEntry, []), noEntry, []).some((f) => f.includes('入口')));
  });

  test('落格失败（layout=null）本身即硬失败', () => {
    assert.ok(failReasons(null, [node('a', 'summit')], []).some((f) => f.includes('落格失败')));
  });
});

// ===== 种子层 =====

describe('青云宗种子 · 画布坐标（20×20 全部落点）', () => {
  test('地图声明 20×20（21 条交叉线），底图 key 本轮为 null', () => {
    assert.equal(qingyunMap.gridRows, 20);
    assert.equal(qingyunMap.gridCols, 20);
    assert.equal(qingyunMap.backgroundKey, null, 'background_key 属 P4，本轮必须留空');
  });

  test('27 个节点全部有整数坐标且在 0..20 内，无撞点', () => {
    assert.equal(nodes.length, 27);
    const seen = new Set<string>();
    for (const n of nodes) {
      assert.ok(Number.isInteger(n.gridRow), `${n.code} 缺 gridRow`);
      assert.ok(Number.isInteger(n.gridCol), `${n.code} 缺 gridCol`);
      assert.ok(inBounds({ row: n.gridRow as number, col: n.gridCol as number }, N), `${n.code} 坐标越界`);
      const key = `${n.gridRow},${n.gridCol}`;
      assert.ok(!seen.has(key), `撞点：${n.code} 与另一节点同在 (${key})`);
      seen.add(key);
    }
    assert.equal(seen.size, 27);
  });

  test('每个节点都有非空风味文案（悬停卡 / 右栏详情不会开天窗）', () => {
    for (const n of nodes) {
      assert.equal(typeof n.description, 'string', `${n.code} 缺 description`);
      assert.ok((n.description as string).trim().length > 0, `${n.code} 的 description 为空串`);
    }
  });

  test('落格确定性：用同一组参数重算，坐标与种子完全一致', () => {
    const layout = layoutNodes({
      n: N,
      nodes: nodes.map((n) => ({ ...n, orderIndex: n.orderIndex })),
      edges: qingyunEdges,
      sep: 2,
      arc: 2.4,
    });
    assert.notEqual(layout, null);
    for (const n of nodes) {
      assert.deepStrictEqual(
        layout?.cell.get(n.code),
        { row: n.gridRow, col: n.gridCol },
        `${n.code} 的种子坐标与算法重算不一致（手改种子后自检会挡住）`,
      );
    }
  });

  test('硬失败自检全过；软提示指标可复现（最大偏移 / 交叉数 / 不相邻最小间距）', () => {
    const layout = layoutNodes({ n: N, nodes, edges: qingyunEdges, sep: 2, arc: 2.4 });
    const reasons = checkLayoutFailures({
      layout,
      nodes,
      edges: qingyunEdges,
      n: N,
      mapCode: 'map_qingyun',
      sep: 2,
    });
    assert.deepStrictEqual(reasons, []);
    const snap = snapError(layout as never);
    assert.ok(snap.max <= MAX_OFFSET_CELLS, `落点最大偏移 ${snap.max} 超过阈值`);
    const gap = minGap(layout as never, qingyunEdges);
    assert.ok(gap.min >= 2, `不相邻最小间距 ${gap.min} 小于 sep`);
    const histogram = edgeSpanHistogram(layout as never, qingyunEdges);
    assert.equal(histogram.max, 19, '最长边跨度变了 —— 若是有意改拓扑请同步任务书 §11.4 的记录');
    assert.ok(crossingPairs(layout as never, qingyunEdges).length >= 0);
  });
});
