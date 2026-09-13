/**
 * 炼器**可用性规则**（纯函数，单独成文件便于单测 + 控制单文件规模）。
 *
 * 可用性只根据**客户端能看到的协议字段**（`rarity` / `status` / 词缀 / 通货持有量）做
 * 「提前禁用 + 说清原因」，真正判定仍在服务端（`craft.service.ts`）。`ItemView` 未暴露
 * `mirrored` / `vaaled`（见回报），因此镜像与瓦尔的「已用过」只能由服务端
 * `MIRROR_IMMUTABLE` / `VAALED_IMMUTABLE` 兜底，面板不假装知道。
 */
import { CRAFT_OPS } from '@idle-path/ionet-transport';
import type { CraftInput, CurrencyView, EssenceView, ItemView } from '@idle-path/ionet-transport';
import type { CraftOpOption, SelectOption } from '@idle-path/ui-kit';
import { opLabel } from './presentation.js';

/** 可用性判定所需的客户端可见上下文。 */
export interface CraftContext {
  item: ItemView | null;
  currencies: readonly CurrencyView[];
  essences: readonly EssenceView[];
  /** `op='essence'` 时选中的精华 code。 */
  essenceCode?: string;
  /** `op='wisp'` 时选中的基底词缀 code。 */
  targetCode?: string;
}

/** 可被 roll 的词缀条数（与 `craft.service.ts` 的 `normalRolled` 同口径）。 */
export function rollableCount(item: ItemView): number {
  return item.affixes.filter((affix) => affix.key !== null && affix.value !== null && affix.fractured !== true).length;
}

/** `op` 额外参数的缺失原因；无需额外参数时返回 null。 */
function extraParamReason(op: string, ctx: CraftContext): string | null {
  if (op === 'essence') {
    if (ctx.essenceCode === undefined) return '先选择要使用的精华';
    const essence = ctx.essences.find((entry) => entry.code === ctx.essenceCode);
    if (essence === undefined) return '所选精华不存在';
    if (essence.owned < 1) return '精华不足：需要 1 枚';
  }
  if (op === 'wisp' && ctx.targetCode === undefined) return '先选择要替换的基底词缀';
  return null;
}

/**
 * `op` 本身（**不含定向参数**）是否可行；不可行返回原因，可行返回空串。
 *
 * 定向参数（精华 / wisp）故意不在这里判：否则「未选精华 → op 被禁用 → 选不了精华」会死锁。
 */
export function opFeasibilityReason(op: string, ctx: CraftContext): string {
  const { item } = ctx;
  if (item === null) return '先选择一件要炼的物品';
  if (item.status !== 'bag') return '仅背包中的物品可炼器';
  if (item.rarity === 3) return '传奇物品词缀固定，不可洗炼';

  const rollable = rollableCount(item);
  switch (op) {
    case 'transmute':
    case 'alchemy':
      if (item.rarity !== 0) return '仅可用于凡品';
      break;
    case 'chaos':
    case 'scour':
      if (item.rarity !== 1 && item.rarity !== 2) return '仅可用于灵品 / 宝品';
      break;
    case 'exalt':
      if (item.rarity !== 1 && item.rarity !== 2) return '需灵品及以上';
      break;
    case 'annul':
      if (rollable === 0) return '没有可剥离的词缀';
      break;
    case 'divine':
      if (item.rarity !== 1 && item.rarity !== 2) return '仅可用于灵品 / 宝品';
      if (rollable === 0) return '没有可重 roll 数值的词缀';
      break;
    case 'fracture':
      if (item.rarity !== 2) return '仅可用于宝品';
      if (rollable < 4) return '宝品至少 4 条词缀才可锁定';
      break;
    case 'essence':
      if (item.rarity !== 1 && item.rarity !== 2) return '仅可用于灵品 / 宝品';
      break;
    default:
      break;
  }

  if (op === 'essence') return '';
  const currency = ctx.currencies.find((entry) => entry.code === op);
  if (currency === undefined) return '该工艺通货未开放';
  if (!currency.implemented) return '该通货尚未实装';
  if (currency.owned < 1) return '缺少该工艺通货（可用开发者注入）';
  return '';
}

/** 炼器按钮不可执行的原因：op 可行性 + 定向参数就绪度；可执行返回空串。 */
export function craftBlockReason(op: string, ctx: CraftContext): string {
  const feasibility = opFeasibilityReason(op, ctx);
  if (feasibility !== '') return feasibility;
  return extraParamReason(op, ctx) ?? '';
}

/** 14 个 op 的选项（含消耗通货与不可用原因），交给 `CraftOpPicker`。 */
export function craftOpOptions(ctx: CraftContext): CraftOpOption[] {
  return CRAFT_OPS.map((op) => {
    const reason = opFeasibilityReason(op, ctx);
    const currency = ctx.currencies.find((entry) => entry.code === op);
    const essence = op === 'essence' ? ctx.essences.find((entry) => entry.code === ctx.essenceCode) : undefined;
    let costLabel: string;
    if (op === 'essence') costLabel = essence === undefined ? '需先选精华' : `${essence.name} ×${essence.owned}`;
    else if (currency === undefined) costLabel = '通货未开放';
    else costLabel = `${currency.name} ×${currency.owned}`;
    return { op, label: opLabel(op), costLabel, available: reason === '', disabledReason: reason === '' ? undefined : reason };
  });
}

/** `op` 的额外参数下拉候选；不需要额外参数时返回 undefined（面板不渲染该控件）。 */
export function extraParamOptions(
  op: string | undefined,
  item: ItemView | null,
  essences: readonly EssenceView[],
): SelectOption[] | undefined {
  if (op === 'essence') {
    return essences.map((essence) => ({
      label: `${essence.name} ×${essence.owned}`,
      value: essence.code,
      disabled: essence.owned < 1,
    }));
  }
  if (op === 'wisp') {
    // ⚠️ 客户端没有基底词缀目录，只能列出当前物品已有的基底词缀（见回报）。
    return (item?.affixes ?? [])
      .filter((affix) => affix.polarity === 'base')
      .map((affix) => ({ label: affix.name, value: affix.code }));
  }
  return undefined;
}

/** 炼器请求组装；缺少必要参数时返回 null（不发悬空请求）。 */
export function buildCraftInput(
  itemId: number | null,
  op: string | undefined,
  essenceCode?: string,
  targetCode?: string,
): CraftInput | null {
  if (itemId === null || op === undefined) return null;
  if (op === 'essence') return essenceCode === undefined ? null : { itemId, op, essenceCode };
  if (op === 'wisp') return targetCode === undefined ? null : { itemId, op, targetCode };
  return { itemId, op };
}
