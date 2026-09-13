/**
 * 一次性生成青云宗地图层的三个种子文件（maps / map-nodes / map-edges）。
 *
 * 规格来源（P2.0，2026-09-14 用户拍板）：
 * - `ai-docs/frontend-solution-exploration/18-P2.0八卦重做与相邻移动任务书.md` §0/§1/§2/§4；
 * - `17-青云宗八卦布局规则.md` §8 结构定稿。
 *
 * ## 结构：**四门，八峰，四院拱卫青云主峰**（合计 17 枢纽）
 * 太极居中（青云主峰）→ 四象环内（四院）→ 八卦环外（八峰）→ 四门最外。
 * **坐标由规格直接给定**（§0 的表），不再走 `layoutNodes` 的极坐标拟合法：
 * 八峰相对八正方位整体旋转 **22.5°**（正北让给北门、第一峰与第八峰夹住北门），
 * 这个角度不是 45° 的整数倍，落格算法的 `sector → 角度` 表表达不了。
 * 但**质量度量**（最大偏移 / 交叉数 / 边跨度直方图 / 不相邻最小间距）仍然跑同一套
 * `scripts/lib/map-layout.mjs` 纯函数 —— 把「显式格子」与「理想极坐标」组成一个 layout 对象即可。
 *
 * ## 用户修正后仍生效的硬约束
 * 1. 挂机只能在「历练秘境峰」—— 地图上不散布挂机点；kind 只有 route/secret_realm/summit，
 *    全图仅 1 个秘境（D8），它既是唯一秘境也是唯一挂机处（击败首个 Boss 解锁，D2）。
 * 2. 青云宗把玩家历练到第 5 境 —— 全图怪物境界 <= 5，门槛按 1~5 境裸装战力排布
 *    （1境=20 / 2境=40 / 3境=60 / 4境=80 / 5境=100）。
 * 3. 世界结构：三千大世界，每个大世界由一个大宗门统治；第 10 境才出大世界进混沌海。
 *
 * ## 画布
 * 拓扑（edges）是**唯一权威**；坐标只是布局。坐标用 **0-based 交叉线索引** `gridRow/gridCol`，
 * 取值 `0..GRID`（GRID = 交叉线条数 − 1 = 20，用户拍板「21 条线」）。
 * 自检分**硬失败**（越界 / 撞点 / 缺坐标 / 最大偏移 > 2.5 格 / 悬空引用 / 连通性）与
 * **软提示**（边跨度直方图 / 不相邻最小间距 / 连线交叉数，只打印不失败）。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  crossingPairs,
  edgeSpanHistogram,
  minGap,
  peaksRadialDeviation,
  polarToCell,
  snapError,
} from './lib/map-layout.mjs';
import { checkLayoutFailures, layoutHints } from './lib/map-layout-check.mjs';

/** 种子目录相对**脚本自身**解析，故从任意 cwd 运行都写到同一处。 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(HERE, '..', 'prisma', 'seeds', 'game');

/**
 * 网格规模 = **交叉线条数 − 1**（P2.0 §1）。
 * 用户拍板「21 条线」⇒ 索引 `0..20`，中心 `(10,10)` 唯一，青云主峰才能居中；
 * 全局 `CELL_PX = 48` 时自然尺寸 1008×1008。
 */
const GRID = 20;
/** 落格参数（不相邻枢纽最小切比雪夫间距）。 */
const SEP = 2;

/** 八峰的理想半径（格）：`peaksR = (n-1)/2 - 1 = 8.5`。 */
const PEAK_R = 8.5;
/** 四院的理想半径（格）：落在四象方位、八卦环之内。 */
const HALL_R = 5;
/** 四门理想半径（格）：最外圈。 */
const GATE_R = 10;

/**
 * 八峰极角（度，0°=正东、90°=正南、270°=正北）：
 * **逆时针编号**，第一峰起于左上 `247.5°`，每峰 −45°；第八峰·历练在 `292.5°` 紧贴北门右侧。
 */
const PEAK_ANGLES = [247.5, 202.5, 157.5, 112.5, 67.5, 22.5, 337.5, 292.5];

/** 职业峰（第一~第七）的 code / 名字。 */
const PROFESSION_PEAKS = [
  ['qy_peak_1', '第一峰'],
  ['qy_peak_2', '第二峰'],
  ['qy_peak_3', '第三峰'],
  ['qy_peak_4', '第四峰'],
  ['qy_peak_5', '第五峰'],
  ['qy_peak_6', '第六峰'],
  ['qy_peak_7', '第七峰'],
];

const ZONE_BY_NODE = { qy_peak_xunlian: 'zone_houshan' };

/**
 * 17 个枢纽（P2.0 §0 坐标表 + §2 四院职能）。
 *
 * 列：code / name / ring / sector / kind / featureKey / level / threshold / hasWaypoint /
 * chapter / requires / description / gridRow / gridCol / idealR / idealA。
 * `idealR/idealA` 只用于质量度量（显式坐标相对理想极坐标的偏移），**不写进种子**。
 */
const NODES = [
  // ===== 四门（最外，四正方位）=====
  { code: 'qy_gate_n', name: '北门', ring: 'outer', sector: 'N', kind: 'route', featureKey: null, level: 2, threshold: 25, hasWaypoint: true, chapter: 1, requires: null, gridRow: 0, gridCol: 10, idealR: GATE_R, idealA: 270, description: '北门背靠雪岭，常年寒气逼人。' },
  { code: 'qy_gate_e', name: '东门', ring: 'outer', sector: 'E', kind: 'route', featureKey: null, level: 1, threshold: 10, hasWaypoint: true, chapter: 1, requires: null, gridRow: 10, gridCol: 20, idealR: GATE_R, idealA: 0, description: '青石山门朝东，晨光最先照到这里。' },
  { code: 'qy_gate_s', name: '南门', ring: 'outer', sector: 'S', kind: 'route', featureKey: null, level: 1, threshold: 10, hasWaypoint: true, chapter: 1, requires: null, gridRow: 20, gridCol: 10, idealR: GATE_R, idealA: 90, description: '南麓坡缓，山下香客多由此上山。' },
  { code: 'qy_gate_w', name: '西门', ring: 'outer', sector: 'W', kind: 'route', featureKey: null, level: 2, threshold: 25, hasWaypoint: true, chapter: 1, requires: null, gridRow: 10, gridCol: 0, idealR: GATE_R, idealA: 180, description: '西门外是万丈云海，风急雾重。' },
  // ===== 八峰（八卦环，整体旋转 22.5°；正北让给北门）=====
  ...PROFESSION_PEAKS.map(([code, name], i) => ({
    code, name, ring: 'peaks', sector: null, kind: 'route', featureKey: 'profession',
    level: 2 + Math.min(i, 3), threshold: 30 + i * 10, hasWaypoint: false, chapter: i < 3 ? 1 : 2,
    requires: null, gridRow: [3, 7, 13, 17, 17, 13, 7][i], gridCol: [7, 3, 3, 7, 14, 17, 17][i],
    idealR: PEAK_R, idealA: PEAK_ANGLES[i],
    description: [
      '职业峰之首，峰势如剑，直指天穹。',
      '峰腰有溪，水声终日不绝。',
      '山石赤红，如炉火未熄。',
      '云雾最重时，半峰隐没不见。',
      '此峰多木，四季常青。',
      '峰顶平坦，可望见宗门全貌。',
      '夕照时整面山壁泛着金光。',
    ][i],
  })),
  // 第八峰·历练：唯一秘境（kind=secret_realm，zone_houshan），紧贴北门右侧
  { code: 'qy_peak_xunlian', name: '第八峰·历练', ring: 'peaks', sector: null, kind: 'secret_realm', featureKey: null, level: 5, threshold: 75, hasWaypoint: false, chapter: 2, requires: null, gridRow: 3, gridCol: 14, idealR: PEAK_R, idealA: PEAK_ANGLES[7], description: '后山妖兽出没，宗门以此历练门人。' },
  // ===== 四院（四象环内，四正方位）=====
  { code: 'qy_chuanfayuan', name: '传法院', ring: 'inner', sector: 'N', kind: 'route', featureKey: 'skill', level: 3, threshold: 55, hasWaypoint: false, chapter: 2, requires: null, gridRow: 5, gridCol: 10, idealR: HALL_R, idealA: 270, description: '传功授法之地，藏经阁与传功崖皆在此院。' },
  { code: 'qy_yulingyuan', name: '育灵院', ring: 'inner', sector: 'E', kind: 'route', featureKey: 'farm', level: 4, threshold: 65, hasWaypoint: false, chapter: 2, requires: null, gridRow: 10, gridCol: 15, idealR: HALL_R, idealA: 0, description: '灵田药园与灵兽苑共处一院，草木生机最盛。' },
  { code: 'qy_baigongyuan', name: '百工院', ring: 'inner', sector: 'S', kind: 'route', featureKey: 'alchemy', level: 5, threshold: 75, hasWaypoint: false, chapter: 2, requires: null, gridRow: 15, gridCol: 10, idealR: HALL_R, idealA: 90, description: '丹炉与锻炉同燃，是宗门的百工之所。' },
  { code: 'qy_zhifayuan', name: '执法院', ring: 'inner', sector: 'W', kind: 'route', featureKey: 'discipline', level: 4, threshold: 70, hasWaypoint: false, chapter: 2, requires: null, gridRow: 10, gridCol: 5, idealR: HALL_R, idealA: 180, description: '戒律与天刑皆归此院，法度森严。' },
  // ===== 太极居中 =====
  { code: 'qy_summit', name: '青云主峰', ring: 'summit', sector: null, kind: 'summit', featureKey: 'quest', level: 5, threshold: 100, hasWaypoint: false, chapter: 2, requires: null, gridRow: 10, gridCol: 10, idealR: 0, idealA: 0, description: '一峰独高，云海尽在脚下，宗门中枢所在。' },
];

/**
 * 邻接表（P2.0 §4，共 **32 条**，平均度 3.8）。
 *
 * 走法心智：`进山门 → 过八峰 → 入院 → 至主峰`。
 * **「峰→院」那 8 条是内环的唯一入口**（八峰环与四院环半径不同、互不接触），
 * 漏掉它们内环就走不进去 —— 由 map-seed 的「从北门出发能走遍全部 17 个节点」用例守着。
 *
 * ⚠️ 本表是**可改的种子数据**（甲方提议、用户未逐字确认 §4）：改这里只动拓扑，不动代码。
 */
const EDGES = [
  // 八峰环（8）：第一—第八—第七—第六—第五—第四—第三—第二—第一
  ['qy_peak_1', 'qy_peak_xunlian'],
  ['qy_peak_xunlian', 'qy_peak_7'],
  ['qy_peak_7', 'qy_peak_6'],
  ['qy_peak_6', 'qy_peak_5'],
  ['qy_peak_5', 'qy_peak_4'],
  ['qy_peak_4', 'qy_peak_3'],
  ['qy_peak_3', 'qy_peak_2'],
  ['qy_peak_2', 'qy_peak_1'],
  // 山门接两邻峰（8）：正北让给北门，第一峰与第八峰夹住它
  ['qy_gate_n', 'qy_peak_1'],
  ['qy_gate_n', 'qy_peak_xunlian'],
  ['qy_gate_e', 'qy_peak_7'],
  ['qy_gate_e', 'qy_peak_6'],
  ['qy_gate_s', 'qy_peak_5'],
  ['qy_gate_s', 'qy_peak_4'],
  ['qy_gate_w', 'qy_peak_2'],
  ['qy_gate_w', 'qy_peak_3'],
  // 峰 → 几何最近的院（8）：内环的唯一入口
  ['qy_peak_1', 'qy_chuanfayuan'],
  ['qy_peak_xunlian', 'qy_chuanfayuan'],
  ['qy_peak_2', 'qy_zhifayuan'],
  ['qy_peak_3', 'qy_zhifayuan'],
  ['qy_peak_4', 'qy_baigongyuan'],
  ['qy_peak_5', 'qy_baigongyuan'],
  ['qy_peak_6', 'qy_yulingyuan'],
  ['qy_peak_7', 'qy_yulingyuan'],
  // 四院环（4）：传法—育灵—百工—执法—传法（N→E→S→W）
  ['qy_chuanfayuan', 'qy_yulingyuan'],
  ['qy_yulingyuan', 'qy_baigongyuan'],
  ['qy_baigongyuan', 'qy_zhifayuan'],
  ['qy_zhifayuan', 'qy_chuanfayuan'],
  // 四院 → 青云主峰（4，放射）
  ['qy_chuanfayuan', 'qy_summit'],
  ['qy_yulingyuan', 'qy_summit'],
  ['qy_baigongyuan', 'qy_summit'],
  ['qy_zhifayuan', 'qy_summit'],
];

const WORLD = 'world_qingyun';

const maps = [
  {
    id: 1,
    code: 'map_qingyun',
    name: '青云宗',
    world: WORLD,
    orderIndex: 1,
    chapterFrom: 1,
    chapterTo: 2,
    requiresMapCode: null,
    description: '四门·八峰·四院拱卫青云主峰（本图历练至第五境）',
    // 画布：坐标空间与底图分辨率（§14.2）。底图本轮不填（backgroundKey = null）
    gridRows: GRID,
    gridCols: GRID,
    backgroundKey: null,
  },
];

const nodes = NODES.map((n, i) => ({
  code: n.code,
  mapCode: 'map_qingyun',
  name: n.name,
  ring: n.ring,
  sector: n.sector ?? null,
  kind: n.kind,
  featureKey: n.featureKey ?? null,
  level: n.level,
  threshold: n.threshold,
  hasWaypoint: n.hasWaypoint ?? false,
  chapter: n.chapter,
  requiresNodeCode: n.requires ?? null,
  zoneCode: ZONE_BY_NODE[n.code] ?? null,
  orderIndex: i + 1,
  description: n.description ?? null,
  gridRow: n.gridRow,
  gridCol: n.gridCol,
}));

const edges = EDGES.map(([from, to], i) => ({
  id: i + 1, mapCode: 'map_qingyun', fromNodeCode: from, toNodeCode: to, bidirectional: true,
}));

// ===== 质量度量：坐标是规格给定的，理想位仍按极坐标算（P2.0 §0 的旋转 22.5° 已写进 idealA）=====
const cell = new Map(NODES.map((n) => [n.code, { row: n.gridRow, col: n.gridCol }]));
const ideal = new Map();
const offsets = new Map();
for (const n of NODES) {
  const want = polarToCell(GRID, { r: n.idealR, a: n.idealA });
  ideal.set(n.code, want);
  offsets.set(n.code, Math.hypot(n.gridRow - want.row, n.gridCol - want.col));
}
const layout = {
  cell,
  ideal,
  offsets,
  maxOffset: Math.max(...offsets.values()),
  sep: SEP,
  arc: 0,
};

await mkdir(SEED_DIR, { recursive: true });
const write = async (file, data) => {
  const target = path.join(SEED_DIR, file);
  await writeFile(target, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(target + ': ' + data.length + ' 条');
};

await write('maps.json', maps);
await write('map-nodes.json', nodes);
await write('map-edges.json', edges);

// ===== 自检（P2.0 §1 / §4；沿用 P1 §5.2 的口径）=====
const codes = new Set(nodes.map((n) => n.code));
const bad = [];
for (const e of edges) {
  if (!codes.has(e.fromNodeCode)) bad.push('edge.from 未定义: ' + e.fromNodeCode);
  if (!codes.has(e.toNodeCode)) bad.push('edge.to 未定义: ' + e.toNodeCode);
}
for (const n of nodes) {
  if (n.requiresNodeCode !== null && !codes.has(n.requiresNodeCode)) {
    bad.push('requires 未定义: ' + n.code + ' → ' + n.requiresNodeCode);
  }
  if (n.kind === 'idle_spot') bad.push('不应存在 idle_spot 节点（挂机只能在历练秘境峰）: ' + n.code);
  if ('unitCode' in n) bad.push('节点不应带 unitCode（秘境产出由 zone 决定）: ' + n.code);
  if ('minRealm' in n) bad.push('节点不应带 minRealm（闸门只有 threshold）: ' + n.code);
}
const overCap = nodes.filter((n) => n.level > 5).map((n) => n.code);
if (overCap.length > 0) bad.push('怪物境界超过本图上限（第五境）: ' + overCap.join(','));

const snap = snapError(layout);
const gap = minGap(layout, edges);
const histogram = edgeSpanHistogram(layout, edges);
const crossings = crossingPairs(layout, edges);
const sigma = peaksRadialDeviation(layout, nodes, GRID);
for (const m of maps) {
  const mapNodes = nodes.filter((n) => n.mapCode === m.code);
  const mapEdges = edges.filter((e) => e.mapCode === m.code);
  const realms = mapNodes.filter((n) => n.kind === 'secret_realm');
  if (realms.length > 1) bad.push('地图 ' + m.code + ' 有 ' + realms.length + ' 个秘境（D8 上限 1）');

  bad.push(
    ...checkLayoutFailures({
      layout,
      nodes: mapNodes,
      edges: mapEdges,
      n: m.gridRows,
      mapCode: m.code,
      sep: SEP,
    }),
  );

  console.log('— ' + m.code + ' 画布自检（软提示，不失败）—');
  for (const hint of layoutHints({
    layout,
    nodes: mapNodes,
    edges: mapEdges,
    n: m.gridRows,
    snapMax: snap.max,
    snapMean: snap.mean,
    spanHistogram: histogram,
    minGap: gap,
    crossings,
    peaksSigma: sigma,
  })) {
    console.log('  · ' + hint);
  }
  console.log(
    '  · 可读性判据（前端，§14.4）：sep × 面板短边 / (n+1) ≥ ICON(34)+8 ⇒ 面板短边 ≥ ' +
      Math.ceil(((34 + 8) * (m.gridRows + 1)) / SEP) +
      'px',
  );
}

if (bad.length > 0) {
  console.error('种子自检失败：\n' + bad.join('\n'));
  process.exit(1);
}

const peaks = nodes.filter((n) => n.ring === 'peaks');
const halls = nodes.filter((n) => n.ring === 'inner');
console.log(
  '自检通过：' + nodes.length + ' 节点 / ' + edges.length + ' 边 / ' + maps.length + ' 地图；' +
    '四门 ' + nodes.filter((n) => n.ring === 'outer').length +
    ' + 八峰 ' + peaks.length + '（职业峰 ' + peaks.filter((n) => n.featureKey === 'profession').length +
    ' + 历练秘境峰 1）+ 四院 ' + halls.length + ' + 主峰 1；怪物境界上限 ' +
    Math.max(...nodes.map((n) => n.level)),
);
console.log(
  '画布：' + GRID + '×' + GRID + ' 交叉线（' + (GRID + 1) + ' 条）/ sep=' + SEP +
    '；落点最大偏移 ' + snap.max.toFixed(2) + ' 格（平均 ' + snap.mean.toFixed(2) +
    '，最差 ' + snap.worst + '）；连线交叉数 ' + crossings.length +
    '；不相邻最小间距 ' + gap.min + ' 格',
);
