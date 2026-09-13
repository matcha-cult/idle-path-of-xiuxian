/**
 * 地图落格算法 + 质量度量（**纯函数，不读写文件、不连库**）。
 *
 * 规格来源：`ai-docs/frontend-solution-exploration/14-地图画布方案探讨.md` §14（坐标系）
 * 与 `15-P1画布实施任务书.md` §5.1（落格算法）。算法移植自 `tmp/map-layout.mjs`（只读参考），
 * 但**节点与边由调用方传入**（参考版直接读种子 JSON，那样没法单测边界）。
 *
 * ## 两条必须守住的规则（第一版探针就是错在这两条上）
 * 1. **极坐标初值按 n 成比例** —— `ring → 半径`、`sector/layer → 角度`，不依赖「贴父节点」，
 *    否则子节点永远贴父节点 1 格，「每格像素变小」就等于「枢纽变挤」。
 * 2. **相邻可近、不相邻须 ≥ sep** —— 拓扑上有边的两个枢纽本来就该挨着（它们之间要画连线），
 *    强制全局 sep 会把「四门紧贴八峰」判成冲突、把门挤到棋盘角上。
 *
 * ## 坐标口径（§14.1）
 * `(row, col)` 是 **0-based 交叉线索引**，取值 `0..n`（含两端）；`(0,0)` 是左上交叉点。
 * 角度用屏幕坐标系的数学约定：0° = 正东（col+），90° = 正南（row+）。
 */

/** 八方位 → 角度（度）。0°=正东，90°=正南，180°=正西，270°=正北。 */
export const SECTOR_ANGLE = Object.freeze({
  E: 0,
  SE: 45,
  S: 90,
  SW: 135,
  W: 180,
  NW: 225,
  N: 270,
  NE: 315,
});

/** 内环四层（内环一最外 … 内环四最内），依 `user-docs/青云宗地图构想.md` §四。 */
export const INNER_LAYER = Object.freeze({
  qy_zhishitang: 1,
  qy_neimen: 1,
  qy_chuansong: 1,
  qy_cangshuge: 2,
  qy_jielvtang: 2,
  qy_chuangongya: 2,
  qy_danxiayuan: 3,
  qy_baiqige: 3,
  qy_lingshouyuan: 3,
  qy_lingtian: 3,
  qy_tianxingtai: 4,
  qy_jindi: 4,
  qy_hufaxieyuan: 4,
});

/** 未知 `ring` 的排名：排在已知环层之后（不 panic，但也别插队）。 */
const UNKNOWN_RANK = 99;

/**
 * 落格顺序排名：**八峰是环的骨架，必须先落**（后落会被挤离方位）。
 * `summit → peaks → inner → approach → outer`（任务书 §5.1 第 2 条）。
 */
export function ringRank(ring) {
  if (ring === 'summit') return 0;
  if (ring === 'peaks') return 1;
  if (ring === 'inner') return 2;
  if (ring === 'approach') return 3;
  if (ring === 'outer') return 4;
  return UNKNOWN_RANK;
}

/**
 * 极坐标理想位（任务书 §5.1 第 1 条）。
 *
 * - `summit`   → 半径 0（正中）；
 * - `peaks`    → 半径 `n/2 - 1`，角度由 `sector`；
 * - `outer`    → 半径 `n/2`，角度由 `sector`（四正方位）；
 * - `approach` → 半径 `(peaksR + gatesR) / 2`，角度 252°（西南偏南，贴西门的回廊口）；
 * - `inner`    → 四层同心弧（内环一最外 … 内环四最内），**弧长恒定**：
 *                每节点占 `arc` 格弧长 ⇒ 半径越小张角越大，外层是贴西门的一小段弧。
 *
 * 返回 `{ r, a }`：`r` 为半径（格），`a` 为角度（度）。未知 `ring` 回退到内环第 2 层。
 */
export function polarFor(n, node, arcPerNode = 2.4) {
  const half = (n - 1) / 2;
  const peaksR = half - 1;
  const gatesR = half;
  if (node.ring === 'summit') return { r: 0, a: 0 };
  if (node.ring === 'peaks' || node.ring === 'outer') {
    return { r: node.ring === 'peaks' ? peaksR : gatesR, a: SECTOR_ANGLE[node.sector] ?? 0 };
  }
  if (node.ring === 'approach') return { r: (peaksR + gatesR) / 2, a: 252 };

  const layer = INNER_LAYER[node.code] ?? 2;
  const innerMax = peaksR - Math.max(1, half * 0.2);
  const innerMin = Math.max(1, half * 0.2);
  const r = innerMax - ((layer - 1) / 3) * (innerMax - innerMin);
  const peers = Object.keys(INNER_LAYER)
    .filter((code) => INNER_LAYER[code] === layer)
    .sort((x, y) => orderOf(node.peers, x) - orderOf(node.peers, y));
  const idx = peers.indexOf(node.code);
  // 弧长恒定 ⇒ 半径越小、张角越大；单节点层落在弧的中点（180°）
  const spanDeg = Math.min(300, ((peers.length * arcPerNode) / Math.max(r, 0.6)) * (180 / Math.PI));
  const ratio = peers.length <= 1 ? 0.5 : idx / (peers.length - 1);
  const a = 180 - spanDeg / 2 + ratio * spanDeg;
  return { r, a };
}

/** `order_index` 查询（`node.peers` 是 `code → orderIndex` 的映射；缺省按 0 处理）。 */
function orderOf(peers, code) {
  if (peers == null) return 0;
  return peers.get ? (peers.get(code) ?? 0) : (peers[code] ?? 0);
}

/** 极坐标 → 格位（可能落在交叉线之间，需要吸附）。 */
export function polarToCell(n, polar) {
  const C = n / 2;
  const rad = (polar.a * Math.PI) / 180;
  return { row: C + polar.r * Math.sin(rad), col: C + polar.r * Math.cos(rad) };
}

/**
 * 落格主函数（确定性）。
 *
 * @param {object} input
 * @param {number} input.n       网格规模（交叉线 `0..n`）
 * @param {Array<{code:string, ring:string, sector?:string|null, orderIndex?:number}>} input.nodes
 * @param {Array<{fromNodeCode:string, toNodeCode:string}>} input.edges
 * @param {number} [input.sep]   不相邻枢纽的最小切比雪夫间距（格），缺省 2
 * @param {number} [input.arc]   内环每节点占的弧长（格），缺省 2.4
 * @returns {{cell: Map<string,{row:number,col:number}>, ideal: Map<string,{row:number,col:number}>,
 *            offsets: Map<string,number>, maxOffset: number, sep: number, arc: number} | null}
 *          落不下时返回 null。
 */
export function layoutNodes(input) {
  const n = input.n;
  const sep = input.sep ?? 2;
  const arc = input.arc ?? 2.4;
  if (!Number.isInteger(n) || n < 0) return null;

  const nodes = input.nodes;
  const edges = input.edges ?? [];
  const linked = new Set();
  for (const edge of edges) {
    linked.add(edge.fromNodeCode + '|' + edge.toNodeCode);
    linked.add(edge.toNodeCode + '|' + edge.fromNodeCode);
  }
  const isLinked = (a, b) => linked.has(a + '|' + b);

  const occupied = new Map();
  const cell = new Map();
  const ideal = new Map();
  const ok = (row, col, code) => {
    if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
    if (row < 0 || row > n || col < 0 || col > n) return false;
    for (const [key, owner] of occupied) {
      const [rr, cc] = key.split(',').map(Number);
      const d = Math.max(Math.abs(rr - row), Math.abs(cc - col));
      if (d < 1) return false;
      if (d < sep && !isLinked(code, owner)) return false; // 拓扑相邻允许贴近
    }
    return true;
  };

  const peers = new Map(nodes.map((node) => [node.code, Number(node.orderIndex ?? 0)]));
  const byRank = (a, b) => {
    const dr = ringRank(a.ring) - ringRank(b.ring);
    if (dr !== 0) return dr;
    if (a.ring === 'inner') {
      return (INNER_LAYER[a.code] ?? 2) - (INNER_LAYER[b.code] ?? 2);
    }
    return String(a.sector ?? '').localeCompare(String(b.sector ?? ''));
  };

  for (const node of [...nodes].sort(byRank)) {
    const polar = polarFor(n, { ...node, peers }, arc);
    const want = polarToCell(n, polar);
    let best = null;
    let bestD = Infinity;
    for (let row = 0; row <= n; row += 1) {
      for (let col = 0; col <= n; col += 1) {
        if (!ok(row, col, node.code)) continue;
        const d = Math.hypot(row - want.row, col - want.col);
        if (d < bestD) {
          bestD = d;
          best = { row, col };
        }
      }
    }
    if (best === null) return null;
    cell.set(node.code, best);
    occupied.set(`${best.row},${best.col}`, node.code);
    ideal.set(node.code, want);
  }

  let maxOffset = 0;
  const offsets = new Map();
  for (const [code, actual] of cell) {
    const want = ideal.get(code);
    const d = Math.hypot(actual.row - want.row, actual.col - want.col);
    offsets.set(code, d);
    if (d > maxOffset) maxOffset = d;
  }
  return { cell, ideal, offsets, maxOffset, sep, arc };
}

/** 落点最大偏移（格）：相对极坐标理想位，越小越贴合理想环。 */
export function snapError(layout) {
  const ds = [...layout.offsets.values()];
  if (ds.length === 0) return { max: 0, mean: 0, worst: null };
  const max = Math.max(...ds);
  const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
  const worst = [...layout.offsets.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { max, mean, worst };
}

/** 八峰实际半径的标准差（格）：越小越圆。格子上 8 个点只能构成正八边形，σ 不会到 0。 */
export function peaksRadialDeviation(layout, nodes, n) {
  const C = n / 2;
  const rs = nodes
    .filter((node) => node.ring === 'peaks' && layout.cell.has(node.code))
    .map((node) => {
      const c = layout.cell.get(node.code);
      return Math.hypot(c.row - C, c.col - C);
    });
  if (rs.length === 0) return 0;
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  return Math.sqrt(rs.reduce((a, r) => a + (r - mean) ** 2, 0) / rs.length);
}

/**
 * **不相邻**枢纽之间的最小中心距（格）。
 *
 * 只统计不相邻的：相邻枢纽本来就该挨着（§11.4 附注），把它们算进「拥挤度」是错的。
 * 返回 `{ min, pair }`；`pair` 为 `[codeA, codeB]`，无可比对象时为 null / Infinity。
 */
export function minGap(layout, edges) {
  const codes = [...layout.cell.keys()];
  const adjacent = new Set();
  for (const edge of edges) {
    adjacent.add(edge.fromNodeCode + '|' + edge.toNodeCode);
    adjacent.add(edge.toNodeCode + '|' + edge.fromNodeCode);
  }
  let min = Infinity;
  let pair = null;
  for (let i = 0; i < codes.length; i += 1) {
    for (let j = i + 1; j < codes.length; j += 1) {
      const a = codes[i];
      const b = codes[j];
      if (adjacent.has(a + '|' + b)) continue;
      const ca = layout.cell.get(a);
      const cb = layout.cell.get(b);
      const d = Math.max(Math.abs(ca.row - cb.row), Math.abs(ca.col - cb.col));
      if (d < min) {
        min = d;
        pair = [a, b];
      }
    }
  }
  return { min, pair };
}

/** 边的几何跨度直方图（切比雪夫格距 → 条数）与最大跨度。**只打印，不失败**（§11.3）。 */
export function edgeSpanHistogram(layout, edges) {
  const histogram = {};
  let max = 0;
  const spans = [];
  for (const edge of edges) {
    const a = layout.cell.get(edge.fromNodeCode);
    const b = layout.cell.get(edge.toNodeCode);
    if (a === undefined || b === undefined) continue;
    const span = Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
    histogram[span] = (histogram[span] ?? 0) + 1;
    spans.push({ edge, span });
    if (span > max) max = span;
  }
  spans.sort((x, y) => y.span - x.span);
  return { histogram, max, spans };
}

/** 二维叉积（`o → a` × `o → b`）；`0` 表示三点共线。 */
function cross(o, a, b) {
  return (a.col - o.col) * (b.row - o.row) - (a.row - o.row) * (b.col - o.col);
}

/** 线段 `p1p2` 与 `p3p4` 是否**真正相交**（共享端点 / 共线重叠不算）。 */
function segmentsCross(p1, p2, p3, p4) {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  const straddle = (a, b) => (a > 0 && b < 0) || (a < 0 && b > 0);
  if (straddle(d1, d2) && straddle(d3, d4)) return true;
  // 共线且重叠（含端点相触）：判为相交 —— 画布上表现为两条线压在一起
  const onSegment = (a, b, c) =>
    Math.min(a.row, b.row) <= c.row &&
    c.row <= Math.max(a.row, b.row) &&
    Math.min(a.col, b.col) <= c.col &&
    c.col <= Math.max(a.col, b.col);
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

/**
 * **连线交叉数**（两两线段求交，排除共享端点的边对）。
 *
 * 交叉没有任何「合理的长线」解释，是纯粹的观感瑕疵（§2.4）。返回交叉的对数明细。
 */
export function crossingPairs(layout, edges) {
  const pairs = [];
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const e1 = edges[i];
      const e2 = edges[j];
      const shared = [e1.fromNodeCode, e1.toNodeCode].some(
        (code) => code === e2.fromNodeCode || code === e2.toNodeCode,
      );
      if (shared) continue;
      const a1 = layout.cell.get(e1.fromNodeCode);
      const a2 = layout.cell.get(e1.toNodeCode);
      const b1 = layout.cell.get(e2.fromNodeCode);
      const b2 = layout.cell.get(e2.toNodeCode);
      if (a1 === undefined || a2 === undefined || b1 === undefined || b2 === undefined) continue;
      if (segmentsCross(a1, a2, b1, b2)) {
        pairs.push([`${e1.fromNodeCode}→${e1.toNodeCode}`, `${e2.fromNodeCode}→${e2.toNodeCode}`]);
      }
    }
  }
  return pairs;
}
