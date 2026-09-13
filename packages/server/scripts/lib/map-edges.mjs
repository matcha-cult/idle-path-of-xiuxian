/**
 * 边表**几何派生**（P2.0 v3 §4）—— 纯函数，不读写文件、不连库。
 *
 * 用户指出的问题：「西门相邻是第二、第三峰，同时他们是执法院的相邻点，
 * 但按目前来看，**这个相邻很容易出现数据定义错位**」。
 * 解法：**边不是独立数据，而是几何的函数** —— 手写边表会和画布漂移，
 * 人在种子里挪一个坐标，边表不会跟着动，于是「画出来的线」和「实际能走的路」对不上。
 *
 * 派生规则（§4.1）：
 * - **同环相邻**：八峰环 / 四院环上角度相邻的两点连边（环闭合）；
 * - **门 → 峰**：每座山门连角度最近的 **2** 座峰（左右各一）；
 * - **峰 → 院**：每座峰连角度最近的 **1** 座院；
 * - **院 → 主峰**：四院各自连青云主峰。
 *
 * 角度口径与 `map-layout.mjs` 一致：0°=正东（col+）、90°=正南（row+）、270°=正北。
 * 中心取 `ring='summit'` 的落格（青云主峰），无主峰时退化为全部格子的包围盒中心。
 */

/** 参与「同环闭合环」的环层与步长（度）。山门不连成环（§4.1 未列）。 */
export const RING_STEP = Object.freeze({ peaks: 45, inner: 90 });

/** 角度归一化到 `[0, 360)`。 */
export function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360;
}

/** 两角最小夹角（度，`0..180`）。 */
export function angularDistance(a, b) {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, 360 - diff);
}

/** 极坐标中心：优先主峰格位，其次全部格子的包围盒中心。 */
export function centerOf(cell, nodes) {
  const summit = nodes.find((node) => node.ring === 'summit' && cell.has(node.code));
  if (summit !== undefined) return cell.get(summit.code);
  const points = [...cell.values()];
  if (points.length === 0) return { row: 0, col: 0 };
  const rows = points.map((p) => p.row);
  const cols = points.map((p) => p.col);
  return {
    row: (Math.min(...rows) + Math.max(...rows)) / 2,
    col: (Math.min(...cols) + Math.max(...cols)) / 2,
  };
}

/** 节点相对中心的极角（度）；落在中心（半径 0）时返回 `null`。 */
export function angleOf(cell, code, center) {
  const point = cell.get(code);
  if (point === undefined) return null;
  const dy = point.row - center.row;
  const dx = point.col - center.col;
  if (Math.hypot(dy, dx) < 1e-9) return null;
  return normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI);
}

/** 按环层分组（只含已落格节点，顺序沿用 `nodes`）。 */
function groupByRing(cell, nodes) {
  const byRing = new Map();
  for (const node of nodes) {
    if (!cell.has(node.code)) continue;
    const list = byRing.get(node.ring);
    if (list === undefined) byRing.set(node.ring, [node]);
    else list.push(node);
  }
  return byRing;
}

/** 环上按角度升序排列（角度为 null 的排在最后，仅可能出现主峰）。 */
function sortedByAngle(list, angle) {
  return [...list].sort((a, b) => {
    const aa = angle.get(a.code);
    const bb = angle.get(b.code);
    if (aa === null) return 1;
    if (bb === null) return -1;
    return aa - bb;
  });
}

/** 距 `code` 角度最近的 `k` 个候选（角度为 null 视为无穷远；并列按 orderIndex）。 */
export function nearestIn(list, angle, code, k) {
  const from = angle.get(code);
  const scored = list.map((node) => ({
    node,
    distance: from === null || angle.get(node.code) === null
      ? Number.POSITIVE_INFINITY
      : angularDistance(from, angle.get(node.code)),
  }));
  scored.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return Number(a.node.orderIndex ?? 0) - Number(b.node.orderIndex ?? 0);
  });
  return scored.slice(0, k).map((entry) => entry.node);
}

/**
 * 由落格坐标派生全部边（确定性，**零手写**）。
 *
 * @param {Map<string,{row:number,col:number}>} cell 节点 code → 格位
 * @param {Array<{code:string,ring:string,orderIndex?:number}>} nodes 节点表
 * @returns {Array<{fromNodeCode:string,toNodeCode:string}>} 去重后的边（按 orderIndex 稳定排序）
 */
export function deriveEdges(cell, nodes) {
  const center = centerOf(cell, nodes);
  const angle = new Map();
  for (const node of nodes) {
    if (cell.has(node.code)) angle.set(node.code, angleOf(cell, node.code, center));
  }
  const byRing = groupByRing(cell, nodes);
  const byOrder = new Map(nodes.map((node) => [node.code, Number(node.orderIndex ?? 0)]));
  const pairs = new Map();
  const add = (a, b) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!pairs.has(key)) pairs.set(key, [a, b]);
  };

  // 同环相邻（八峰环 / 四院环，闭合）
  for (const ring of Object.keys(RING_STEP)) {
    const list = sortedByAngle(byRing.get(ring) ?? [], angle);
    for (let i = 0; i < list.length; i += 1) {
      add(list[i].code, list[(i + 1) % list.length].code);
    }
  }
  // 门 → 角度最近的 2 座峰
  for (const gate of byRing.get('outer') ?? []) {
    for (const peak of nearestIn(byRing.get('peaks') ?? [], angle, gate.code, 2)) {
      add(gate.code, peak.code);
    }
  }
  // 峰 → 角度最近的 1 座院
  for (const peak of byRing.get('peaks') ?? []) {
    for (const hall of nearestIn(byRing.get('inner') ?? [], angle, peak.code, 1)) {
      add(peak.code, hall.code);
    }
  }
  // 院 → 主峰
  const summit = (byRing.get('summit') ?? [])[0];
  if (summit !== undefined) {
    for (const hall of byRing.get('inner') ?? []) add(hall.code, summit.code);
  }

  return [...pairs.values()]
    .map(([a, b]) => (byOrder.get(a) <= byOrder.get(b)
      ? { fromNodeCode: a, toNodeCode: b }
      : { fromNodeCode: b, toNodeCode: a }))
    .sort((x, y) => {
      const dx = byOrder.get(x.fromNodeCode) - byOrder.get(y.fromNodeCode);
      if (dx !== 0) return dx;
      return byOrder.get(x.toNodeCode) - byOrder.get(y.toNodeCode);
    });
}

/**
 * 结构性自检（§4.2）：对每条边硬性断言两端满足下面**之一**，否则返回失败明细：
 *
 * 1. **同环且角度相邻**（在按角度排序的环上相邻，环闭合）；
 * 2. **相邻环且角度最近**（门-峰：峰在该门最近 2 峰内且该门是该峰最近的门；
 *    峰-院：院是该峰最近 1 院；院-主峰：主峰是中心枢纽）。
 *
 * 另外做**完整性**校验：`deriveEdges()` 的每条边都必须在给定边表里
 * —— 少一条也会失败（否则「画出来的线 ≡ 可走的路 ≡ 边表」的保证会被漏边打破）。
 *
 * @returns {string[]} 失败明细（空数组 = 通过）
 */
export function checkEdgeStructure(edges, nodes, cell) {
  const failures = [];
  const center = centerOf(cell, nodes);
  const angle = new Map();
  for (const node of nodes) {
    if (cell.has(node.code)) angle.set(node.code, angleOf(cell, node.code, center));
  }
  const byRing = groupByRing(cell, nodes);
  const byCode = new Map(nodes.map((node) => [node.code, node]));
  const ringOrder = new Map(
    Object.keys(RING_STEP).map((ring) => [ring, sortedByAngle(byRing.get(ring) ?? [], angle)]),
  );

  const sameRingAdjacent = (a, b) => {
    if (a.ring !== b.ring || !(a.ring in RING_STEP)) return false;
    const list = ringOrder.get(a.ring) ?? [];
    const i = list.findIndex((node) => node.code === a.code);
    const j = list.findIndex((node) => node.code === b.code);
    if (i < 0 || j < 0) return false;
    const n = list.length;
    return (i + 1) % n === j || (j + 1) % n === i;
  };
  const gatePeak = (gate, peak) => {
    if (gate.ring !== 'outer' || peak.ring !== 'peaks') return false;
    const two = nearestIn(byRing.get('peaks') ?? [], angle, gate.code, 2).map((node) => node.code);
    const nearestGate = nearestIn(byRing.get('outer') ?? [], angle, peak.code, 1)[0]?.code;
    return two.includes(peak.code) && nearestGate === gate.code;
  };
  const peakHall = (peak, hall) => {
    if (peak.ring !== 'peaks' || hall.ring !== 'inner') return false;
    const nearest = nearestIn(byRing.get('inner') ?? [], angle, peak.code, 1)[0]?.code;
    return nearest === hall.code;
  };
  const hallSummit = (a, b) => {
    const pair = [a.ring, b.ring].sort().join('|');
    return pair === 'inner|summit';
  };

  for (const edge of edges) {
    const a = byCode.get(edge.fromNodeCode);
    const b = byCode.get(edge.toNodeCode);
    if (a === undefined || b === undefined || !cell.has(a.code) || !cell.has(b.code)) {
      failures.push(`边端点未定义或未落格：${edge.fromNodeCode} → ${edge.toNodeCode}`);
      continue;
    }
    const ok =
      sameRingAdjacent(a, b) ||
      gatePeak(a, b) ||
      gatePeak(b, a) ||
      peakHall(a, b) ||
      peakHall(b, a) ||
      hallSummit(a, b);
    if (!ok) {
      failures.push(
        `结构非法：${a.code}(${a.ring}${fmt(angle.get(a.code))}) ↔ ` +
          `${b.code}(${b.ring}${fmt(angle.get(b.code))}) —— ` +
          '既非「同环角度相邻」，也非「相邻环角度最近」',
      );
    }
  }

  const given = new Set(edges.map((e) => [e.fromNodeCode, e.toNodeCode].sort().join('|')));
  for (const edge of deriveEdges(cell, nodes)) {
    const key = [edge.fromNodeCode, edge.toNodeCode].sort().join('|');
    if (!given.has(key)) failures.push(`缺少派生边：${key}`);
  }
  return failures;
}

function fmt(angle) {
  return angle === null || angle === undefined ? '' : `,${angle.toFixed(1)}°`;
}
