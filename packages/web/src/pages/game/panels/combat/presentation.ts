/**
 * 战斗图鉴的**展示翻译**（纯函数，单独成文件便于单测）。
 *
 * 只做「协议值 → 玩家语言」，不含任何业务规则：
 * - `camp` code → 中文阵营（`hostile` 才是可击杀目标）；
 * - 掉落表条目的目标名（基底 / 通货 / 精华）——通货与精华名由调用方用 `economy`
 *   域的 code→名称映射注入，**绝不把协议 code 打到屏幕上**；
 * - 掉落数量区间文案。
 */
import { RARITY_NAMES, type DropEntryView, type UnitCatalogView } from '@idle-path/ionet-transport';

/** 阵营 code → 中文名；未知 code 给中性文案而不是回显 code。 */
const CAMP_LABELS: Record<string, string> = {
  hostile: '敌对',
  neutral: '中立',
  friendly: '友善',
};

/** 阵营短标签（单位卡上的 Tag）。 */
export function campLabel(camp: string): string {
  return CAMP_LABELS[camp] ?? '未知阵营';
}

/** 是否可击杀：只有敌对单位才是击杀目标（与后端 `camp='hostile'` 判定一致）。 */
export function isKillable(unit: UnitCatalogView): boolean {
  return unit.camp === 'hostile';
}

/** 该单位的掉落来自哪张掉落表（按 code join，`null` 表示无掉落）。 */
export function dropTableCodeOf(unit: UnitCatalogView): string | null {
  return unit.dropTable;
}

/** 掉落数量区间：`min == max` 时只显示一个数。 */
export function countText(entry: DropEntryView): string {
  return entry.minCount === entry.maxCount
    ? String(entry.minCount)
    : `${entry.minCount}~${entry.maxCount}`;
}

/** 稀有度序号 → 中文名；越界给「未知」。 */
export function rarityName(rarity: number | null): string {
  if (rarity === null) return '未知';
  return RARITY_NAMES[rarity] ?? '未知';
}

/**
 * 掉落条目的展示名。
 * - `base`：`T{tier} · {稀有度}`（基底实例的 `baseId` 是内部 id，不上屏）；
 * - `currency`：通货中文名（缺映射时给「未知通货」）；
 * - `essence`：精华中文名（缺映射时给「未知精华」）。
 */
export function dropEntryLabel(
  entry: DropEntryView,
  nameOf: (code: string) => string | undefined,
): string {
  if (entry.kind === 'base') {
    const tier = entry.baseTier === null ? '?' : `T${entry.baseTier}`;
    return `${tier} · ${rarityName(entry.rarity)}`;
  }
  if (entry.kind === 'currency') {
    return entry.currencyCode === null ? '未知通货' : nameOf(entry.currencyCode) ?? '未知通货';
  }
  if (entry.kind === 'essence') {
    return entry.essenceCode === null ? '未知精华' : nameOf(entry.essenceCode) ?? '未知精华';
  }
  return '未知掉落';
}

/** 掉落类别 code → 中文名（`DropPoolTable` 的别名列）。 */
export function dropKindLabel(kind: string): string {
  if (kind === 'base') return '装备';
  if (kind === 'currency') return '工艺通货';
  if (kind === 'essence') return '精华';
  return '其它';
}

/** 拾取规则动作 code → 中文名（`salvage` 才是默认兜底动作）。 */
export function pickupActionLabel(action: string): string {
  if (action === 'salvage') return '分解';
  if (action === 'sell') return '出售';
  if (action === 'discard') return '弃置';
  if (action === 'keep') return '保留';
  return '未知动作';
}

/** 单位战斗四维（键集合由服务端决定，未知键照常展示但排在四维之后）。 */
export interface UnitStatEntry {
  key: string;
  label: string;
  value: number;
}

/** 四维中文名（`baseStats` 的固定四键）。 */
const STAT_LABELS: Record<string, string> = {
  hp: '气血',
  atk: '攻击',
  def: '防御',
  spiritPower: '神识',
};

/** 把 `baseStats` 摊平成展示条目：固定四键优先，其余键按原顺序追加。 */
export function unitStatEntries(baseStats: Readonly<Record<string, number>>): UnitStatEntry[] {
  const known = ['hp', 'atk', 'def', 'spiritPower'].filter((key) => key in baseStats);
  const rest = Object.keys(baseStats).filter((key) => !known.includes(key));
  return [...known, ...rest].map((key) => ({
    key,
    label: STAT_LABELS[key] ?? key,
    value: baseStats[key] ?? Number.NaN,
  }));
}
