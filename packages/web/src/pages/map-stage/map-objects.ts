/**
 * `map-objects` —— **地图内可交互对象**（北极星原话：「进入地图之后，加载目标地图的可交互对象，
 * 如 npc、传送点、秘境入口……在 pc 端，左边地图网格，右边地图内可交互对象」）。
 *
 * ## 数据不是编的：照搬后端节点表
 * 全部来自 `packages/server/prisma/seeds/game/map-nodes.json`（17 个节点）：
 * - `hasWaypoint: true` ⇒ **传送点**（正是四座宗门门）；
 * - `featureKey` ⇒ 这里有什么：`realm` 秘境入口 / `profession` 传承 / `skill` 功法 /
 *   `farm` 灵田 / `alchemy` 丹房 / `discipline` 执法 / `quest` 任务；
 * - `name` / `description` 原样搬上面板（名称与描述只有一个真相，不在前端改写）。
 *
 * ## 前后端 key 不同，映射表是唯一接口
 * 点位用 `peak_1` / `gate_2`，后端用 `qy_peak_1` / `qy_gate_n`。`NODE_POINT_MAP` 就是这两套 key
 * 的对应关系（按**方位**对齐：东门 ↔ 0°、北门 ↔ 90°、传法院 ↔ 北、育灵院 ↔ 东……），
 * 以后接后端（`map.interact` / 节点接口）只改这一张表。
 *
 * 一处**已知口径差异**（记录下来，不擅自"对齐"）：后端的 `gridRow/gridCol` 是**旧整数格布局**，
 * 它那里的「第一峰」落在 113°（= 新布局 `peak_3` 的位置）。本表按**序号**对应
 * （第一峰 ↔ `peak_1`），因为新点位表写明"正式名称以后由数据表给出、key 不受影响"——
 * 名称归后端、位置归新表。真要改成按角度对应，只动 `NODE_POINT_MAP` 里的 `pointKey`。
 *
 * ## 传送解锁（北极星：「必须和传送点交互之后才可解锁传送」）
 * `canTravel()` 是**纯函数**：只有传送点、且已与它交互过才为 true。真正的解锁与"传到哪去"
 * 仍归后端 `map.interact`（本次不改后端），这里先做成可见、可测的前端门控。
 */

/** 可交互对象的种类。 */
export type MapObjectKind =
  | 'waypoint'
  | 'realm'
  | 'profession'
  | 'skill'
  | 'farm'
  | 'alchemy'
  | 'discipline'
  | 'quest'
  | 'npc';

/** 种类的中文名（面板上用；加新种类必须同时补这里与颜色表，有测试兜底）。 */
export const OBJECT_KIND_LABEL: Record<MapObjectKind, string> = {
  waypoint: '传送点',
  realm: '秘境入口',
  profession: '传承',
  skill: '功法',
  farm: '灵田',
  alchemy: '丹房',
  discipline: '执法',
  quest: '任务',
  npc: 'NPC',
};

/** 种类的 antd **预设色名**（禁止内联 hex，见仓库门禁）。 */
export const OBJECT_KIND_COLOR: Record<MapObjectKind, string> = {
  waypoint: 'gold',
  realm: 'purple',
  profession: 'blue',
  skill: 'cyan',
  farm: 'green',
  alchemy: 'magenta',
  discipline: 'red',
  quest: 'geekblue',
  npc: 'default',
};

/** 一个可交互对象。`key` 稳定（= 后端节点 code；NPC 加后缀），面板与状态都以它为准。 */
export interface MapObject {
  key: string;
  /** 后端 `map-nodes.json` 的 `code` */
  nodeCode: string;
  /** 本页点位 key（`map-catalog.ts` 里的 key） */
  pointKey: string;
  kind: MapObjectKind;
  /** 面板上显示的名字（来自后端节点 `name`） */
  label: string;
  /** 一句话说明（来自后端节点 `description`） */
  detail: string;
  /** 交互后是否解锁「传送」（只有传送点） */
  travel: boolean;
  /** 后端还没有这张表（目前只有 NPC）—— 面板上会显式标「占位」，不假装是真的 */
  placeholder: boolean;
}

interface NodeRow {
  nodeCode: string;
  pointKey: string;
  name: string;
  kind: MapObjectKind;
  detail: string;
  travel?: boolean;
}

/**
 * 17 个节点各一个对象（顺序与后端一致：四门 → 八峰 → 四院 → 主峰后山的排法不要求一致，
 * 但**每一条都能在 `map-nodes.json` 里查到同一个 code**，有测试直接读那个 JSON 核对）。
 */
const NODE_OBJECTS: readonly NodeRow[] = [
  { nodeCode: 'qy_gate_n', pointKey: 'gate_2', name: '北门', kind: 'waypoint', travel: true, detail: '北门背靠雪岭，常年寒气逼人。' },
  { nodeCode: 'qy_gate_e', pointKey: 'gate_1', name: '东门', kind: 'waypoint', travel: true, detail: '青石山门朝东，晨光最先照到这里。' },
  { nodeCode: 'qy_gate_s', pointKey: 'gate_4', name: '南门', kind: 'waypoint', travel: true, detail: '南麓坡缓，山下香客多由此上山。' },
  { nodeCode: 'qy_gate_w', pointKey: 'gate_3', name: '西门', kind: 'waypoint', travel: true, detail: '西门外是万丈云海，风急雾重。' },
  { nodeCode: 'qy_peak_1', pointKey: 'peak_1', name: '第一峰', kind: 'profession', detail: '职业峰之首，峰势如剑，直指天穹。' },
  { nodeCode: 'qy_peak_2', pointKey: 'peak_2', name: '第二峰', kind: 'profession', detail: '峰腰有溪，水声终日不绝。' },
  { nodeCode: 'qy_peak_3', pointKey: 'peak_3', name: '第三峰', kind: 'profession', detail: '山石赤红，如炉火未熄。' },
  { nodeCode: 'qy_peak_4', pointKey: 'peak_4', name: '第四峰', kind: 'profession', detail: '云雾最重时，半峰隐没不见。' },
  { nodeCode: 'qy_peak_5', pointKey: 'peak_5', name: '第五峰', kind: 'profession', detail: '此峰多木，四季常青。' },
  { nodeCode: 'qy_peak_6', pointKey: 'peak_6', name: '第六峰', kind: 'profession', detail: '峰顶平坦，可望见宗门全貌。' },
  { nodeCode: 'qy_peak_7', pointKey: 'peak_7', name: '第七峰', kind: 'profession', detail: '夕照时整面山壁泛着金光。' },
  { nodeCode: 'qy_peak_xunlian', pointKey: 'peak_8', name: '第八峰·后山', kind: 'realm', detail: '后山幽深，一方古旧石台立于云雾间，宗门秘境皆由此入。' },
  { nodeCode: 'qy_chuanfayuan', pointKey: 'court_2', name: '传法院', kind: 'skill', detail: '传功授法之地，藏经阁与传功崖皆在此院。' },
  { nodeCode: 'qy_yulingyuan', pointKey: 'court_1', name: '育灵院', kind: 'farm', detail: '灵田药园与灵兽苑共处一院，草木生机最盛。' },
  { nodeCode: 'qy_baigongyuan', pointKey: 'court_4', name: '百工院', kind: 'alchemy', detail: '丹炉与锻炉同燃，是宗门的百工之所。' },
  { nodeCode: 'qy_zhifayuan', pointKey: 'court_3', name: '执法院', kind: 'discipline', detail: '戒律与天刑皆归此院，法度森严。' },
  { nodeCode: 'qy_summit', pointKey: 'summit', name: '青云主峰', kind: 'quest', detail: '一峰独高，云海尽在脚下，宗门中枢所在。' },
];

/**
 * 占位 NPC：后端**还没有** NPC 表（`map.interact` 也没落地），所以这两个是占位数据 ——
 * 面板上会带「占位」标记。宁可显示"这是假的"，也不让面板假装后端已经有 NPC。
 */
const PLACEHOLDER_NPCS: readonly NodeRow[] = [
  { nodeCode: 'qy_gate_n', pointKey: 'gate_2', name: '守门弟子', kind: 'npc', detail: '（占位）北门值守的入门弟子。' },
  { nodeCode: 'qy_summit', pointKey: 'summit', name: '执事弟子', kind: 'npc', detail: '（占位）主峰执事，管着来往事务。' },
];

/** 前端点位 key ↔ 后端节点 code（两套 key 的唯一接口）。 */
export const NODE_POINT_MAP: readonly { nodeCode: string; pointKey: string }[] = [
  ...NODE_OBJECTS.map(({ nodeCode, pointKey }) => ({ nodeCode, pointKey })),
  ...PLACEHOLDER_NPCS.map(({ nodeCode, pointKey }) => ({ nodeCode, pointKey })),
];

const toObject = (row: NodeRow): MapObject => ({
  // 同一个节点可以有多个对象（守门弟子 + 北门）⇒ NPC 的 key 加后缀
  key: row.kind === 'npc' ? `${row.nodeCode}#npc` : row.nodeCode,
  nodeCode: row.nodeCode,
  pointKey: row.pointKey,
  kind: row.kind,
  label: row.name,
  detail: row.detail,
  travel: row.travel === true,
  placeholder: row.kind === 'npc',
});

/** 本地图（`map_qingyun`）的全部可交互对象。 */
export const MAP_OBJECTS: readonly MapObject[] = [
  ...NODE_OBJECTS.map(toObject),
  ...PLACEHOLDER_NPCS.map(toObject),
];

/** 某个点位上的可交互对象（未知 key ⇒ 空数组，不抛错）。 */
export function objectsOfPoint(pointKey: string): readonly MapObject[] {
  return MAP_OBJECTS.filter((object) => object.pointKey === pointKey);
}

/** 是否已经和这个对象交互过。 */
export function isInteracted(object: MapObject, interacted: readonly string[]): boolean {
  return interacted.includes(object.key);
}

/**
 * 是否可以传送：**必须是传送点，且已与它交互过**（北极星的门槛）。
 * 非传送点（秘境/任务/传承……）即使交互过也不能传送 —— 它们解锁的是别的东西。
 */
export function canTravel(object: MapObject, interacted: readonly string[]): boolean {
  return object.travel && isInteracted(object, interacted);
}

/** 对象统计（面板标题与读数用；种类顺序按首次出现，稳定可断言）。 */
export function objectCounts(): {
  total: number;
  kinds: readonly { kind: MapObjectKind; label: string; count: number }[];
} {
  const kinds: { kind: MapObjectKind; label: string; count: number }[] = [];
  for (const object of MAP_OBJECTS) {
    const found = kinds.find((item) => item.kind === object.kind);
    if (found === undefined) kinds.push({ kind: object.kind, label: OBJECT_KIND_LABEL[object.kind], count: 1 });
    else found.count += 1;
  }
  return { total: MAP_OBJECTS.length, kinds };
}
