/**
 * 一次性生成青云宗地图层的三个种子文件（maps / map-nodes / map-edges）。
 * 规格来源：ai-docs/settings-revision-2.md §7.4 节点表 / §7.5 拓扑。产出即仓库约定的纯 JSON 种子。
 *
 * ## 用户修正后的三条硬约束
 * 1. 挂机只能在「历练秘境峰」—— 地图上不散布挂机点；kind 只有 route/secret_realm/summit，
 *    全图仅 1 个秘境（D8），它既是唯一秘境也是唯一挂机处（击败首个 Boss 解锁，D2）。
 * 2. 青云宗把玩家历练到第 5 境 —— 全图怪物境界 <= 5，门槛按 1~5 境裸装战力排布
 *    （1境=20 / 2境=40 / 3境=60 / 4境=80 / 5境=100）。
 * 3. 世界结构：三千大世界，每个大世界由一个大宗门统治；第 10 境才出大世界进混沌海。
 *    本图属于 world_qingyun，混沌海是另一个世界、本轮留空。
 *
 * ## P1 画布（任务书 §5）
 * 拓扑（edges / requires_node_code）仍是**唯一权威**；坐标只是布局。本脚本给每个节点算出
 * **0-based 交叉线索引** `gridRow/gridCol`（§14.1），落格算法与度量在 `lib/map-layout.mjs`。
 * 自检分**硬失败**（越界 / 撞点 / 缺坐标 / 最大偏移 > 2.5 格 / 悬空引用 / 连通性）与
 * **软提示**（边跨度直方图 / 不相邻最小间距 / 连线交叉数，只打印不失败）。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  crossingPairs,
  edgeSpanHistogram,
  layoutNodes,
  minGap,
  peaksRadialDeviation,
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
/** 落格参数（任务书 §5.1 第 5 条）。 */
const SEP = 2;
const ARC = 2.4;

/**
 * 节点表。列序：code / name / ring / sector / kind / featureKey / level / threshold /
 * hasWaypoint / chapter / requires / description（风味文案，悬停卡与右栏用）。
 */
const NODES = [
  ['qy_gate_e', '东门', 'outer', 'E', 'route', null, 1, 10, true, 1, null, '青石山门朝东，晨光最先照到这里。'],
  ['qy_gate_s', '南门', 'outer', 'S', 'route', null, 1, 10, true, 1, null, '南麓坡缓，山下香客多由此上山。'],
  ['qy_gate_w', '西门', 'outer', 'W', 'route', null, 2, 25, true, 1, null, '西门外是万丈云海，风急雾重。'],
  ['qy_gate_n', '北门', 'outer', 'N', 'route', null, 2, 25, true, 1, null, '北门背靠雪岭，常年寒气逼人。'],
  ['qy_approach', '外门接引区', 'approach', null, 'route', null, 1, 10, true, 1, 'qy_gate_e', '新入门的弟子在此登记名册，领腰牌。'],
  ['qy_peak_tianshu', '天枢峰', 'peaks', 'N', 'route', 'profession', 2, 30, false, 1, 'qy_approach', '北斗第一峰，剑修在此开脉。'],
  ['qy_peak_tianxuan', '天璇峰', 'peaks', 'NE', 'route', 'profession', 3, 45, false, 1, 'qy_peak_tianshu', '峰顶有巨岩如磨，日夜转动不息。'],
  ['qy_peak_tianji', '天玑峰', 'peaks', 'E', 'route', 'profession', 3, 50, false, 1, 'qy_peak_tianxuan', '云雾缭绕，峰腰遍植灵茶。'],
  ['qy_peak_tianquan', '天权峰', 'peaks', 'SE', 'route', 'profession', 4, 65, false, 2, 'qy_peak_tianji', '权峰多机关，据说是器修手笔。'],
  ['qy_peak_yuheng', '玉衡峰', 'peaks', 'S', 'route', 'profession', 4, 70, false, 2, 'qy_peak_tianquan', '衡峰如一杆玉尺，横亘在南天。'],
  ['qy_peak_kaiyang', '开阳峰', 'peaks', 'SW', 'route', 'profession', 5, 85, false, 2, 'qy_peak_yuheng', '夕阳把整面崖壁照成金红。'],
  ['qy_peak_yaoguang', '瑶光峰', 'peaks', 'W', 'route', 'profession', 5, 90, false, 2, 'qy_peak_kaiyang', '北斗之柄，峰下即是内门地界。'],
  ['qy_houshan', '后山峰', 'peaks', 'NW', 'secret_realm', null, 5, 75, false, 2, 'qy_peak_yaoguang', '后山常年妖兽出没，宗门以此历练门人。'],
  ['qy_zhishitang', '执事堂', 'inner', null, 'route', 'quest', 3, 55, false, 2, 'qy_peak_yaoguang', '宗门庶务都在这座堂里交割。'],
  ['qy_neimen', '内门广场', 'inner', null, 'route', 'waypoint', 4, 70, true, 2, 'qy_zhishitang', '演武的石坪，晨钟一响便有弟子在此列队。'],
  ['qy_chuansong', '青云传送阵', 'inner', null, 'route', 'waypoint', 4, 70, true, 2, 'qy_neimen', '阵纹常年不灭，另一端连着各峰。'],
  ['qy_cangshuge', '藏书阁', 'inner', null, 'route', 'skill', 4, 75, false, 2, 'qy_neimen', '九层木阁，藏尽宗门功法与旧档。'],
  ['qy_jielvtang', '戒律堂', 'inner', null, 'route', 'discipline', 4, 75, false, 2, 'qy_neimen', '堂前立着历代祖师的戒碑。'],
  ['qy_chuangongya', '传功崖', 'inner', null, 'route', 'skill', 4, 75, false, 2, 'qy_neimen', '崖壁上刀痕剑迹纵横，都是前辈留招。'],
  ['qy_danxiayuan', '丹霞院', 'inner', null, 'route', 'alchemy', 5, 90, false, 2, 'qy_cangshuge', '炉火整日不熄，丹香飘出半里。'],
  ['qy_baiqige', '百器阁', 'inner', null, 'route', 'craft', 5, 90, false, 2, 'qy_cangshuge', '阁中炉锤声不绝，锻的是门中弟子的兵器。'],
  ['qy_lingshouyuan', '灵兽苑', 'inner', null, 'route', 'beast', 5, 90, false, 2, 'qy_cangshuge', '灵兽各有脾性，苑中弟子须得耐心。'],
  ['qy_lingtian', '灵田药园', 'inner', null, 'route', 'farm', 5, 90, false, 2, 'qy_cangshuge', '灵田按节气轮种，药香混着泥土气。'],
  ['qy_tianxingtai', '天刑台', 'inner', null, 'route', 'pvp', 5, 95, false, 2, 'qy_danxiayuan', '宗门弟子在此比试，点到为止。'],
  ['qy_jindi', '禁地入口', 'inner', null, 'route', null, 5, 95, false, 2, 'qy_danxiayuan', '重重禁制封锁，非长老不得入内。'],
  ['qy_hufaxieyuan', '护法下院', 'inner', null, 'route', null, 5, 95, false, 2, 'qy_danxiayuan', '护法长老静修之处，院中寂然无声。'],
  ['qy_summit', '青云主峰', 'summit', null, 'summit', null, 5, 100, false, 2, 'qy_hufaxieyuan', '一峰独高，云海尽在脚下。'],
];

const ZONE_BY_NODE = { qy_houshan: 'zone_houshan' };

const EDGES = [
  ['qy_gate_e', 'qy_approach'],
  ['qy_gate_s', 'qy_approach'],
  ['qy_gate_w', 'qy_approach'],
  ['qy_gate_n', 'qy_approach'],
  ['qy_approach', 'qy_peak_tianshu'],
  ['qy_peak_tianshu', 'qy_peak_tianxuan'],
  ['qy_peak_tianxuan', 'qy_peak_tianji'],
  ['qy_peak_tianji', 'qy_peak_tianquan'],
  ['qy_peak_tianquan', 'qy_peak_yuheng'],
  ['qy_peak_yuheng', 'qy_peak_kaiyang'],
  ['qy_peak_kaiyang', 'qy_peak_yaoguang'],
  ['qy_peak_yaoguang', 'qy_houshan'],
  ['qy_houshan', 'qy_peak_tianshu'],
  ['qy_peak_yaoguang', 'qy_zhishitang'],
  ['qy_zhishitang', 'qy_neimen'],
  ['qy_neimen', 'qy_chuansong'],
  ['qy_neimen', 'qy_cangshuge'],
  ['qy_neimen', 'qy_jielvtang'],
  ['qy_neimen', 'qy_chuangongya'],
  ['qy_cangshuge', 'qy_danxiayuan'],
  ['qy_cangshuge', 'qy_baiqige'],
  ['qy_cangshuge', 'qy_lingshouyuan'],
  ['qy_cangshuge', 'qy_lingtian'],
  ['qy_danxiayuan', 'qy_tianxingtai'],
  ['qy_danxiayuan', 'qy_jindi'],
  ['qy_danxiayuan', 'qy_hufaxieyuan'],
  ['qy_hufaxieyuan', 'qy_summit'],
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
    description: '四门八峰·内环功能·中央主峰（本图历练至第五境）',
    // P1 画布：坐标空间与底图分辨率（§14.2）。底图本轮不填（backgroundKey = null）
    gridRows: GRID,
    gridCols: GRID,
    backgroundKey: null,
  },
];

const nodes = NODES.map(
  ([code, name, ring, sector, kind, featureKey, level, threshold, hasWaypoint, chapter, requires, description], i) => ({
    code, mapCode: 'map_qingyun', name, ring, sector, kind, featureKey, level, threshold,
    hasWaypoint, chapter, requiresNodeCode: requires, zoneCode: ZONE_BY_NODE[code] ?? null, orderIndex: i + 1,
    description: description ?? null,
  }),
);

const edges = EDGES.map(([from, to], i) => ({
  id: i + 1, mapCode: 'map_qingyun', fromNodeCode: from, toNodeCode: to, bidirectional: true,
}));

// ===== 落格（任务书 §5.1）：确定性算法，结果写进种子的 gridRow / gridCol =====
const layout = layoutNodes({ n: GRID, nodes, edges, sep: SEP, arc: ARC });
if (layout === null) {
  console.error(`落格失败：n=${GRID} sep=${SEP} arc=${ARC} 下排不下 ${nodes.length} 个节点`);
  process.exit(1);
}
for (const node of nodes) {
  const cell = layout.cell.get(node.code);
  node.gridRow = cell.row;
  node.gridCol = cell.col;
}

await mkdir(SEED_DIR, { recursive: true });
const write = async (file, data) => {
  const target = path.join(SEED_DIR, file);
  await writeFile(target, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(target + ': ' + data.length + ' 条');
};

await write('maps.json', maps);
await write('map-nodes.json', nodes);
await write('map-edges.json', edges);

// ===== 自检（任务书 §5.2）=====
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
const inMap = (n) => n.mapCode === 'map_qingyun';
for (const m of maps) {
  const mapNodes = nodes.filter(inMap);
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
console.log(
  '自检通过：' + nodes.length + ' 节点 / ' + edges.length + ' 边 / ' + maps.length + ' 地图；' +
    '八峰 ' + peaks.length + '（职业峰 ' + peaks.filter((n) => n.featureKey === 'profession').length +
    ' + 历练秘境峰 1）；怪物境界上限 ' + Math.max(...nodes.map((n) => n.level)),
);
console.log(
  '画布：' + GRID + '×' + GRID + ' 交叉线 / sep=' + SEP + ' / arc=' + ARC +
    '；落点最大偏移 ' + snap.max.toFixed(2) + ' 格（平均 ' + snap.mean.toFixed(2) +
    '，最差 ' + snap.worst + '）；连线交叉数 ' + crossings.length +
    '；不相邻最小间距 ' + gap.min + ' 格',
);

