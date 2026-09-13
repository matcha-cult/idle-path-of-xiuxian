/**
 * 背包展示纯函数（无 React / 无 store，可单测）：
 * 把 `ItemView` 翻译成玩家能读的中文，并提供本页筛选与门槛判定。
 *
 * 纪律：`status` / `category` 等协议原文只做判定键，**一律经本表映射后再上屏**；
 * 本文件不含任何游戏公式，只翻译服务端字段。
 */
import type { AffixView, ItemView } from '@idle-path/ionet-transport';
import type { AffixEntryView } from '@idle-path/ui-kit';
import { formatCompactNumber } from '../../../../domain/format.js';

/** 物品品类（=基底 `category`）→ 中文；未知值给占位，绝不回显协议 code。 */
export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  weapon: '武器',
  body: '衣甲',
  helmet: '头盔',
  gloves: '护手',
  boots: '战靴',
  shield: '盾牌',
  ring: '戒指',
  amulet: '护符',
  belt: '腰带',
};

/** 品类筛选项（顺序固定，便于测试与展示稳定）。 */
export const CATEGORY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = Object.entries(
  CATEGORY_LABELS,
).map(([value, label]) => ({ value, label }));

/** 品类 code → 中文；未知品类退化为中性文案。 */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? '其它';
}

/** 物品状态 → 中文（`status` 原文不上屏）。 */
export function statusLabel(status: string): string {
  if (status === 'bag') return '在背包';
  if (status === 'equipped') return '已装备';
  return '不可用';
}

/** 背包筛选条件；`null` / 非有限数一律表示「不筛」。 */
export interface BagFilters {
  rarity: number | null;
  category: string | null;
  tierMin: number | null;
  tierMax: number | null;
}

/** 把可空的数字门槛归一为有限数或 `null`（`NaN` / `Infinity` 视为未设置）。 */
function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

/**
 * 本页客户端筛选（服务端分页已定，故只筛当前页）：
 * `tierMin > tierMax` 时交集为空，不抛错；空条件数组原样返回。
 */
export function filterBagItems(items: readonly ItemView[], filters: BagFilters): ItemView[] {
  const rarity = finiteOrNull(filters.rarity);
  const tierMin = finiteOrNull(filters.tierMin);
  const tierMax = finiteOrNull(filters.tierMax);
  const { category } = filters;

  return items.filter((item) => {
    if (rarity !== null && item.rarity !== rarity) return false;
    if (category !== null && item.category !== category) return false;
    if (tierMin !== null && item.tier < tierMin) return false;
    if (tierMax !== null && item.tier > tierMax) return false;
    return true;
  });
}

/** 「装备」按钮的不可用原因；可装备返回空串。 */
export function equipBlockReason(item: ItemView, realm: number): string {
  if (item.status !== 'bag') return item.status === 'equipped' ? '已装备' : '当前状态不可装备';
  if (!Number.isFinite(item.tier)) return '阶数数据缺失';
  if (!Number.isFinite(realm) || item.tier > realm) {
    return `境界不足：需 T${formatCompactNumber(item.tier)}（当前 T${formatCompactNumber(realm)}）`;
  }
  return '';
}

/** 「丢弃」按钮的不可用原因；可丢弃返回空串（已装备物品必须先卸下）。 */
export function discardBlockReason(item: ItemView): string {
  return item.status === 'bag' ? '' : '仅背包中的物品可丢弃';
}

/** 物品 `slot` 在装备栏里的实际槽位内容：戒指优先 `ring1`，其次 `ring2`。 */
export function wornForSlot(
  slot: string | null,
  slots: Readonly<Record<string, { id: number; name: string; rarity: number; tier: number } | null>>,
): { id: number; name: string; rarity: number; tier: number } | null {
  if (slot === null) return null;
  if (slot === 'ring') return slots.ring1 ?? slots.ring2 ?? null;
  return slots[slot] ?? null;
}

/** `ItemView.affixes` → `AffixList` 词条（`affixId` 只做 key，不上屏）。 */
export function toAffixEntries(affixes: readonly AffixView[]): AffixEntryView[] {
  return affixes.map((affix, index) => ({
    name: affix.name,
    tier: affix.tier,
    polarity: affix.polarity,
    value: affix.value,
    key: `${affix.affixId}-${index}`,
    fractured: affix.fractured === true,
  }));
}
