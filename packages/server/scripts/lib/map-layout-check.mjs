/**
 * 地图种子 / 落格的**质量自检**（纯函数：给定 layout + 节点表 + 边表，返回硬失败与软提示）。
 *
 * 规格来源：`15-P1画布实施任务书.md` §5.2。分两类：
 *
 * **硬失败**（挡住提交）
 * - 坐标在 `0..n` 内（越界 = 枢纽画到画布外，玩家永远点不到）；
 * - 同图无撞点（DB 唯一约束的前置兜底）；
 * - 每个节点都有坐标（漏格 = 图上有洞）；
 * - **落点最大偏移 ≤ 2.5 格**（相对极坐标理想位；`sep` 贪大就会崩形状）；
 * - 前置引用不悬空；
 * - 连通性（从无前置的入口节点出发，沿边能走到每一个节点）。
 *
 * **软提示**（只打印，不失败）
 * - 边跨度直方图（PoE 自己就有横穿全图的长线，长 ≠ 丑，交给人判断）；
 * - **不相邻最小间距**（相邻枢纽本就该挨着，不算拥挤）；
 * - **连线交叉数**。
 *
 * ⚠️ 任务书 §5.2 只写「交叉数」是软提示但没给阈值，§2.4 说「建议硬卡阈值」。
 * 本实现**按任务书写成软提示**（只打印），阈值待拍板后再收紧 —— 见任务书 §5.2 表格。
 */

const MAX_OFFSET_CELLS = 2.5;

/** 坐标是否落在 `0..n` 的交叉线索引内（含两端）。 */
export function inBounds(cell, n) {
  return (
    Number.isInteger(cell?.row) &&
    Number.isInteger(cell?.col) &&
    cell.row >= 0 &&
    cell.row <= n &&
    cell.col >= 0 &&
    cell.col <= n
  );
}

/** 边的无向邻接表（`bidirectional=false` 时只认 from → to）。 */
export function adjacencyOf(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.code, []]));
  for (const edge of edges) {
    if (adjacency.has(edge.fromNodeCode)) adjacency.get(edge.fromNodeCode).push(edge.toNodeCode);
    if (edge.bidirectional !== false && adjacency.has(edge.toNodeCode)) {
      adjacency.get(edge.toNodeCode).push(edge.fromNodeCode);
    }
  }
  return adjacency;
}

/**
 * 硬失败检查（不抛异常，返回明细数组）。
 *
 * @param {object} input
 * @param {object|null} input.layout  `layoutNodes()` 的返回值（null = 落不下）
 * @param {Array} input.nodes         节点表（含 `code` / `ring`）
 * @param {Array} input.edges         边表
 * @param {number} input.n            网格规模
 * @param {string} [input.mapCode]    地图 code（仅用于文案）
 * @param {number} [input.sep]        本次使用的 sep
 * @returns {string[]} 失败明细（空数组 = 通过）
 */
export function checkLayoutFailures(input) {
  const failures = [];
  const { layout, nodes, edges, n } = input;
  const label = input.mapCode ? `[${input.mapCode}] ` : '';

  if (layout === null || layout === undefined) {
    return [`${label}落格失败：n=${n} sep=${input.sep ?? '?'} 下排不下 ${nodes.length} 个节点`];
  }

  const placed = layout.cell;
  const missing = nodes.filter((node) => !placed.has(node.code)).map((node) => node.code);
  if (missing.length > 0) failures.push(`${label}未落格（图上有洞）：${missing.join(', ')}`);

  const outOfBounds = [];
  const seen = new Map();
  for (const [code, cell] of placed) {
    if (!inBounds(cell, n)) outOfBounds.push(`${code}(${cell.row},${cell.col})`);
    const key = `${cell.row},${cell.col}`;
    if (seen.has(key)) failures.push(`${label}撞点：${seen.get(key)} 与 ${code} 同在 (${cell.row},${cell.col})`);
    else seen.set(key, code);
  }
  if (outOfBounds.length > 0) {
    failures.push(`${label}坐标越界（须在 0..${n} 内）：${outOfBounds.join(', ')}`);
  }

  // 落点最大偏移：环形还美不美的真判据（只看最小间距会把「挤到棋盘角」判成优等生）
  const offenders = [...layout.offsets.entries()]
    .filter(([, d]) => d > MAX_OFFSET_CELLS)
    .sort((a, b) => b[1] - a[1])
    .map(([code, d]) => `${code}(${d.toFixed(2)} 格)`);
  if (offenders.length > 0) {
    failures.push(
      `${label}落点最大偏移超过 ${MAX_OFFSET_CELLS} 格：${offenders.join(', ')}（sep 贪大就会崩形状）`,
    );
  }

  // 前置引用不悬空
  const codes = new Set(nodes.map((node) => node.code));
  for (const node of nodes) {
    const requires = node.requiresNodeCode;
    if (requires != null && requires !== '' && !codes.has(requires)) {
      failures.push(`${label}前置引用悬空：${node.code} → ${requires}`);
    }
  }

  // 连通性：从无前置的入口节点出发，沿边能走到每一个节点
  const adjacency = adjacencyOf(nodes, edges);
  const entries = nodes.filter((node) => node.requiresNodeCode == null || node.requiresNodeCode === '');
  if (entries.length === 0 && nodes.length > 0) {
    failures.push(`${label}没有入口节点（所有节点都要求前置）`);
  }
  const reached = new Set(entries.map((node) => node.code));
  const queue = [...reached];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of adjacency.get(current) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  const unreachable = nodes.filter((node) => !reached.has(node.code)).map((node) => node.code);
  if (unreachable.length > 0) failures.push(`${label}不可达节点：${unreachable.join(', ')}`);

  return failures;
}

/** 软提示：边跨度直方图 / 最大跨度 / 不相邻最小间距 / 交叉数 / 八峰 σ。 */
export function layoutHints(input) {
  const { layout, nodes, edges, n } = input;
  const hints = [];
  if (layout === null || layout === undefined) return ['（落格失败，无软提示）'];

  const histogram = input.spanHistogram;
  if (histogram) {
    hints.push(`边跨度直方图：${JSON.stringify(histogram.histogram)}（最大 ${histogram.max} 格）`);
    const longest = histogram.spans.slice(0, 3);
    if (longest.length > 0) {
      hints.push(
        '最长边：' + longest.map((s) => `${s.edge.fromNodeCode}→${s.edge.toNodeCode}=${s.span}格`).join('、'),
      );
    }
  }

  const gap = input.minGap;
  if (gap) {
    const px = Number.isFinite(gap.min) ? (gap.min * 48).toFixed(1) : '—';
    const pair = gap.pair ? gap.pair.join(' ↔ ') : '—';
    hints.push(`不相邻最小间距：${Number.isFinite(gap.min) ? gap.min : '—'} 格（≈${px}px，${pair}）`);
  }

  if (input.crossings) {
    hints.push(
      `连线交叉数：${input.crossings.length}` +
        (input.crossings.length > 0
          ? '（' + input.crossings.slice(0, 3).map((pair) => pair.join(' × ')).join('；') + '）'
          : ''),
    );
  }

  if (input.peaksSigma !== undefined) {
    hints.push(`八峰半径标准差：${input.peaksSigma.toFixed(3)} 格`);
  }

  hints.push(`落点最大偏移：${input.snapMax.toFixed(2)} 格 / 平均 ${input.snapMean.toFixed(2)} 格`);
  return hints;
}

export { MAX_OFFSET_CELLS };
