/**
 * 炼器面板的**展示映射**（纯函数，单独成文件便于单测）。
 *
 * 可用性判定在 `craft-rules.ts`；这里只做「协议值 → 玩家语言」的翻译与列表筛选。
 *
 * 实现真相（`10-...md` §4-1）：`drop-tables.json` 只给 chaos/alchemy/exalt/divine/transmute
 * 掉落，其余 8 种通货当前**没有掉落来源**，面板用「无掉落来源」角标如实标注。
 */
import { RARITY_NAMES } from '@idle-path/ionet-transport';
import type { AffixView, CurrencyView, EssenceView, ItemView } from '@idle-path/ionet-transport';
import type { AffixEntryView, ItemPickerFilters, SelectOption } from '@idle-path/ui-kit';

/** 工艺通货 op → 中文名（与 `currencies.json` 种子一一对应）。 */
const CRAFT_OP_LABELS: Record<string, string> = {
  transmute: '蜕变石',
  alchemy: '点金石',
  chaos: '混沌石',
  exalt: '崇高石',
  annul: '剥离石',
  scour: '重铸石',
  divine: '神圣石',
  blessed: '祝福石',
  mirror: '映道镜',
  vaal: '瓦尔宝珠',
  fracture: '破溃宝珠',
  ember: '古灵余烬',
  wisp: '古灵溶液',
  essence: '精华',
};

/** 当前版本无掉落来源的工艺通货（实测 `drop-tables.json` 只含另外 5 种）。 */
const NO_DROP_SOURCE_OPS: readonly string[] = [
  'annul',
  'scour',
  'blessed',
  'mirror',
  'vaal',
  'fracture',
  'ember',
  'wisp',
];

/** 需要二次确认的破坏性 / 不可逆操作（摧毁、清空词缀、复制）。 */
export const DESTRUCTIVE_OPS: readonly string[] = ['vaal', 'scour', 'mirror'];

/** `op` → 中文名；未知值不泄露协议原文。 */
export function opLabel(op: string): string {
  return CRAFT_OP_LABELS[op] ?? '未知工艺';
}

/** 该通货当前是否可通过掉落获得（否则只能开发者注入）。 */
export function hasDropSource(code: string): boolean {
  return !NO_DROP_SOURCE_OPS.includes(code);
}

/** 词缀视图 → `AffixList` 条目（`affixId` 只做 key，不上屏）。 */
export function affixEntries(affixes: readonly AffixView[]): AffixEntryView[] {
  return affixes.map((affix, index) => ({
    key: `${affix.affixId}-${index}`,
    name: affix.name,
    tier: affix.tier,
    polarity: affix.polarity,
    value: affix.value,
    fractured: affix.fractured === true,
  }));
}

/** 稀有度下拉候选（名称来自协议常量，值用下标）。 */
export function rarityOptions(): SelectOption[] {
  return RARITY_NAMES.map((name, index) => ({ label: name, value: index }));
}

/** 背包选物筛选（组件只回调，真正的过滤在这里做）。 */
export function filterItems(items: readonly ItemView[], filters: ItemPickerFilters): ItemView[] {
  const keyword = typeof filters.keyword === 'string' ? filters.keyword.trim() : '';
  const rarity = filters.rarity;
  return items.filter((item) => {
    if (rarity !== undefined && String(item.rarity) !== String(rarity)) return false;
    if (keyword !== '' && !item.name.includes(keyword)) return false;
    return true;
  });
}

/** 炼器结果 outcome 原文 → 中文；未知值给中性占位，不泄露协议 code。 */
export function outcomeLabel(outcome?: string): string | null {
  if (outcome === undefined) return null;
  if (outcome === 'empowered') return '强化成功：词缀数值提升';
  if (outcome === 'demonic') return '入魔：追加一条负面铭文';
  return '结果已结算';
}

/** 开发注入下拉候选：通货与精华合并且按名称可辨（值为 `kind:code`，code 只做请求值）。 */
export function injectOptions(
  currencies: readonly CurrencyView[],
  essences: readonly EssenceView[],
): SelectOption[] {
  return [
    ...currencies.map((entry) => ({ label: `${entry.name}（通货 ×${entry.owned}）`, value: `currency:${entry.code}` })),
    ...essences.map((entry) => ({ label: `${entry.name}（精华 ×${entry.owned}）`, value: `essence:${entry.code}` })),
  ];
}

/** 解析注入选项 → 目标；无法识别返回 null（按钮据此禁用，不发空 code 请求）。 */
export function injectTarget(value: string | undefined): { kind: 'currency' | 'essence'; code: string } | null {
  if (value === undefined) return null;
  for (const kind of ['currency', 'essence'] as const) {
    const prefix = `${kind}:`;
    if (value.startsWith(prefix) && value.length > prefix.length) {
      return { kind, code: value.slice(prefix.length) };
    }
  }
  return null;
}

/** 注入目标的中文名（确认气泡只显示名称，**不泄露 code**）。 */
export function injectTargetName(
  currencies: readonly CurrencyView[],
  essences: readonly EssenceView[],
  value: string | undefined,
): string {
  const target = injectTarget(value);
  if (target === null) return '';
  if (target.kind === 'currency') {
    return currencies.find((entry) => entry.code === target.code)?.name ?? '未知通货';
  }
  return essences.find((entry) => entry.code === target.code)?.name ?? '未知精华';
}
