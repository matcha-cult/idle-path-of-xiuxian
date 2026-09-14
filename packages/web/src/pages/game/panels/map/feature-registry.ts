/**
 * 地图「承载系统是否已实现」的**客户端注册表**。
 *
 * 为什么判断落在客户端：`feature_key` 是**数据**（服务端只描述「这个地点是什么」），
 * 「这个系统做了没」是**代码事实**。若写进数据库，种子会随实现进度腐烂
 * （每实现一个系统都要改库），而实现进度本来就是前端代码的现状 —— 见任务书 §4。
 *
 * 因此：已实现的系统在这里登记（给出承载面板 key）；未登记的 = 未实现，
 * 由 `FeatureGate` 统一渲染「未开放」并禁用入口。
 * `featureKey` **原文绝不上屏**，展示一律用下表中的中文名。
 */

/**
 * §22：承载「宗门秘境突破」的 feature key。地图右栏据此判断要不要挂上「秘境石台」交互区
 * —— 用常量而不是散落的字面量，避免契约靠字符串巧合成立。
 */
export const REALM_FEATURE_KEY = 'realm';

/** 当前协议可能出现的 `feature_key`（`MapNodeView.featureKey`）。 */
export type MapFeatureKey =
  | 'skill'
  | 'craft'
  | 'quest'
  | 'waypoint'
  | 'alchemy'
  | 'beast'
  | 'farm'
  | 'pvp'
  | 'discipline'
  | 'profession'
  | 'realm';

/**
 * 已实现系统 → 承载面板 key。**未列出 = 尚未实现**（渲染「未开放」）。
 *
 * - `skill`（藏书阁 / 传功崖）→ 功法面板；
 * - `craft`（百器阁）→ 通货·炼器面板；
 * - `quest`（执事堂）→ 任务面板；
 * - `waypoint`（内门广场 / 青云传送阵）→ 地图自身：传送点体系就是本面板的机制，已实现。
 *
 * 未实现（入图但显示未开放）：`alchemy` 丹霞院 / `beast` 灵兽苑 / `farm` 灵田药园 /
 * `pvp` 天刑台 / `discipline` 戒律堂 / `profession` 七职业峰。
 */
export const FEATURE_PANELS: Partial<Record<MapFeatureKey, string>> = {
  skill: 'skill',
  craft: 'economy',
  quest: 'quest',
  waypoint: 'map',
  // §22：第八峰·后山「秘境石台」—— 交互**就地发生**（`RealmStoneSection` 直接嵌在地图右栏），
  // 因此这里登记的 `zone` 只是「秘境的家在秘境面板」这一事实，不是跳转动作。
  realm: 'zone',
};

/** 系统展示名（中文）。协议 key 原文不上屏。 */
const FEATURE_LABELS: Record<MapFeatureKey, string> = {
  skill: '功法',
  craft: '炼器',
  quest: '任务',
  waypoint: '传送',
  alchemy: '炼丹',
  beast: '御兽',
  farm: '灵田',
  pvp: '斗法',
  discipline: '戒律',
  profession: '职业',
  realm: '秘境',
};

/** 未实现 feature 清单（供 UI 与测试遍历；`FEATURE_PANELS` 是唯一事实来源）。 */
export const UNIMPLEMENTED_FEATURES: readonly MapFeatureKey[] = (
  Object.keys(FEATURE_LABELS) as MapFeatureKey[]
).filter((key) => !Object.prototype.hasOwnProperty.call(FEATURE_PANELS, key));

/** 未知 featureKey 的兜底展示名（**绝不**回显协议原文）。 */
const UNKNOWN_FEATURE_LABEL = '此地系统';

/**
 * 该 featureKey 承载的系统是否已实现。
 *
 * 用 `hasOwnProperty` 而非 `in`：`in` 会把原型链上的 `constructor` / `toString`
 * 当成已实现，而 `featureKey` 是外部字符串，必须按自有键判定。
 */
export function featureIsImplemented(featureKey: string | null): boolean {
  if (featureKey === null) return false;
  return Object.prototype.hasOwnProperty.call(FEATURE_PANELS, featureKey);
}

/** 已实现系统承载的面板 key；未实现 / 未知返回 null。 */
export function featurePanelOf(featureKey: string | null): string | null {
  if (featureKey === null) return null;
  return FEATURE_PANELS[featureKey as MapFeatureKey] ?? null;
}

/** 系统展示名（中文）；`featureKey` 为 null 返回 null，未知 key 走兜底名。 */
export function featureLabelOf(featureKey: string | null): string | null {
  if (featureKey === null) return null;
  return FEATURE_LABELS[featureKey as MapFeatureKey] ?? UNKNOWN_FEATURE_LABEL;
}
