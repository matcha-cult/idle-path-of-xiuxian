/**
 * SettlementSummary —— 一次结算的产出摘要。
 *
 * 用途：zone / idle / combat 三域结算响应同形，本组件统一「灵韵 / 保留物品 / 分解 / 出售 / 弃置 /
 * 卡阶跳过」六段语义，供各结算弹窗与结算页复用。
 * 约定：
 * - 数值区走 antd `Descriptions`（`column={{ xs: 1, sm: 2, md: 3 }}` + `colon={false}`）；
 * - 颜色只用 antd token / `Tag` 预设色：正向灵韵用 `Tag color="success"`，绝不写 hex；
 * - 掉落物品由 `items` 插槽渲染（如 `ItemCard` 列表），本组件不含任何物品结构。
 *
 * 边界：
 * - 必填段（灵韵 / 保留物品）**零值也照常显示**（玩家需要看到「这次 0 件」）；
 *   可选段（`salvaged` / `sold` / `discarded` / `blockedByTier` / `resources`）未传时不渲染该行；
 * - `lingyun.gained` / `total`、各计数、`resources` 的值非有限数（NaN / Infinity）一律显示 `—`；
 * - 负数照常带符号显示（如 `-5`）；`resources` 的 `currencies` / `essences` 为空对象时不出标签。
 */
import { Descriptions, Flex, Tag } from 'antd';
import type { DescriptionsProps } from 'antd';
import type { ReactNode } from 'react';

export interface SettlementLingyun {
  /** 本次获得的灵韵（可为负，表示扣减）。 */
  gained: number;
  /** 结算后的灵韵总额；缺省时不显示「（共 M）」。 */
  total?: number;
}

export interface SettlementSalvaged {
  /** 分解件数。 */
  count: number;
  /** 分解换回的灵韵。 */
  lingyun: number;
}

export interface SettlementSold {
  /** 出售件数。 */
  count: number;
  /** 出售换回的灵石。 */
  spiritStones: number;
}

export interface SettlementResources {
  /** 通货掉落（code → 数量）。 */
  currencies?: Readonly<Record<string, number>>;
  /** 精华掉落（code → 数量）。 */
  essences?: Readonly<Record<string, number>>;
}

export interface SettlementSummaryProps {
  /** 灵韵收益（总额可选）。 */
  lingyun: SettlementLingyun;
  /** 保留进背包的物品数。 */
  kept: number;
  /** 分解结果（数量 + 换回的灵韵）；缺省时不渲染该行。 */
  salvaged?: SettlementSalvaged;
  /** 出售结果（数量 + 换回的灵石）；缺省时不渲染该行。 */
  sold?: SettlementSold;
  /** 直接弃置件数；缺省时不渲染该行。 */
  discarded?: number;
  /** 因阶数不足被跳过的件数；缺省时不渲染该行。 */
  blockedByTier?: number;
  /** 附加掉落资源（通货 / 精华，code → 数量）；缺省或全空时不渲染标签区。 */
  resources?: SettlementResources;
  /** code → 中文名（调用方给；缺省或返回空串时显示「未知资源」占位，**不回显 code**）。 */
  nameOf?: (code: string) => string;
  /** 掉落物品展示区（调用方渲染 `ItemCard` 列表等）；非空时渲染在数值区下方。 */
  items?: ReactNode;
}

/** 非有限数值的统一占位符。 */
const NON_FINITE_TEXT = '—';

/** 带正负号的数值文案：正数加 `+`，负数与 0 原样。 */
function signedText(value: number): string {
  if (!Number.isFinite(value)) return NON_FINITE_TEXT;
  return value > 0 ? `+${value}` : String(value);
}

/** 不带符号的数值文案。 */
function plainText(value: number): string {
  return Number.isFinite(value) ? String(value) : NON_FINITE_TEXT;
}

/** 件数文案：`N 件`。 */
function countText(value: number): string {
  return `${plainText(value)} 件`;
}

interface ResourceTagEntry {
  key: string;
  label: string;
}

/** 资源 code 查不到中文名时的占位。**绝不回退成 code 本身**：协议 code 只能做 key / testid，不许上屏。 */
const UNKNOWN_RESOURCE_LABEL = '未知资源';

/** 把 currencies / essences 摊平成 `名称 ×数量` 标签；空对象不产出条目。 */
function collectResourceTags(
  resources: SettlementResources | undefined,
  nameOf: ((code: string) => string) | undefined,
): ResourceTagEntry[] {
  if (!resources) return [];
  const groups: ReadonlyArray<readonly [string, Readonly<Record<string, number>> | undefined]> = [
    ['currency', resources.currencies],
    ['essence', resources.essences],
  ];
  return groups.flatMap(([group, entries]) =>
    Object.entries(entries ?? {}).map(([code, count]) => ({
      key: `${group}:${code}`,
      label: `${nameOf?.(code) || UNKNOWN_RESOURCE_LABEL} ×${plainText(count)}`,
    })),
  );
}

export function SettlementSummary(props: SettlementSummaryProps) {
  const { lingyun, kept, salvaged, sold, discarded, blockedByTier, resources, nameOf, items } = props;

  const gainedUp = Number.isFinite(lingyun.gained) && lingyun.gained > 0;
  const gainedText = signedText(lingyun.gained);
  const lingyunNode = gainedUp ? <Tag color="success">{gainedText}</Tag> : gainedText;
  const totalNode =
    lingyun.total !== undefined && lingyun.total !== null ? `（共 ${plainText(lingyun.total)}）` : '';
  const tags = collectResourceTags(resources, nameOf);

  const descItems: NonNullable<DescriptionsProps['items']> = [
    {
      key: 'lingyun',
      label: '灵韵',
      children: (
        <span data-testid="settlement-lingyun">
          {lingyunNode}
          {totalNode}
        </span>
      ),
    },
    {
      key: 'kept',
      label: '保留物品',
      children: <span data-testid="settlement-kept">{countText(kept)}</span>,
    },
  ];

  if (salvaged) {
    const text = `${countText(salvaged.count)} → 灵韵 ${signedText(salvaged.lingyun)}`;
    descItems.push({
      key: 'salvaged',
      label: '分解',
      children: <span data-testid="settlement-salvaged">{text}</span>,
    });
  }
  if (sold) {
    const text = `${countText(sold.count)} → 灵石 ${signedText(sold.spiritStones)}`;
    descItems.push({
      key: 'sold',
      label: '出售',
      children: <span data-testid="settlement-sold">{text}</span>,
    });
  }
  if (discarded !== undefined) {
    descItems.push({
      key: 'discarded',
      label: '弃置',
      children: <span data-testid="settlement-discarded">{countText(discarded)}</span>,
    });
  }
  if (blockedByTier !== undefined) {
    descItems.push({
      key: 'blockedByTier',
      label: '卡阶跳过',
      children: <span data-testid="settlement-blocked-by-tier">{countText(blockedByTier)}</span>,
    });
  }

  return (
    <Flex vertical gap={12} data-testid="settlement-summary-root">
      <Descriptions
        data-testid="settlement-summary-descriptions"
        colon={false}
        column={{ xs: 1, sm: 2, md: 3 }}
        items={descItems}
      />
      {tags.length > 0 ? (
        <Flex wrap gap={8} data-testid="settlement-resources">
          {tags.map((tag) => (
            <Tag key={tag.key} color="blue">
              {tag.label}
            </Tag>
          ))}
        </Flex>
      ) : null}
      {items !== undefined && items !== null && items !== false ? (
        <Flex vertical data-testid="settlement-items">
          {items}
        </Flex>
      ) : null}
    </Flex>
  );
}
