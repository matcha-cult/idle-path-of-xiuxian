/**
 * AffixList —— 词条列表（前后缀 / T 阶 / 天定铭文），游戏语义通用组。
 *
 * 用途：装备、背包、通货·炼器、战斗图鉴里一切「一个物品有哪些词条」的展示。
 * 约定：
 * - 结构只用 antd `Flex` + `Typography` + `Tag`（刻意不用 `Timeline`：词条之间没有时序语义）；
 * - `polarity` **只做语义分组**（`prefix` 前 / `suffix` 后 / 其它中性），不显示英文 code；
 * - 颜色只用 `Tag` 的预设色名（`warning` 等），禁止内联 hex；
 * - 纯展示、受控、无副作用，不 import 任何业务包。
 *
 * 文本优先级：`effectsTexts`（逐条展示）> `valueText` > `value`；都没有时只显示名字。
 * 边界：`affixes=[]` → `emptyText`（缺省「无词缀」）；`tier=0` 显示 `T0`（不被 falsy 吞）；
 *       `value=0` 显示 `0`；`value` 为 `null` / 缺失 / 非有限数时只显示名字。
 */
import { Flex, Tag, Typography, theme } from 'antd';
import type { ReactNode } from 'react';

export interface AffixEntryView {
  name: string;
  tier?: number;
  polarity?: 'prefix' | 'suffix' | 'base' | string;
  value?: number | null;
  key?: string | null;
  fractured?: boolean;
  /** 后端已渲染好的整句（优先展示）。 */
  effectsTexts?: readonly string[];
  /** 该词缀 roll 出来的数值文本（可选，优先于 value）。 */
  valueText?: string;
}

export interface AffixListProps {
  affixes: readonly AffixEntryView[];
  /** 是否显示 T 阶，缺省 true。 */
  showTier?: boolean;
  /** 紧凑模式（行间距更小），缺省 false。 */
  compact?: boolean;
  /** 空列表文案，缺省「无词缀」。 */
  emptyText?: ReactNode;
}

/** 分组次序：前缀 → 中性（`base` / 未知 / 缺失）→ 后缀。 */
const POLARITY_RANK: Record<string, number> = { prefix: 0, base: 1, suffix: 2 };

/** 未知 polarity 一律按中性处理（不显示原文，只影响排序）。 */
function rankOf(polarity: string | undefined): number {
  if (polarity === undefined) return 1;
  return POLARITY_RANK[polarity] ?? 1;
}

/** 稳定分组：只在跨组时换位，组内保持入参顺序。 */
function orderAffixes(affixes: readonly AffixEntryView[]): AffixEntryView[] {
  return affixes
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rankOf(a.entry.polarity) - rankOf(b.entry.polarity) || a.index - b.index)
    .map((pair) => pair.entry);
}

/** 数值段文本：`valueText` 优先；否则用有限数 `value`；`null` / 缺失 / 非有限数 → 无。 */
function resolveValueText(entry: AffixEntryView): string | null {
  if (entry.valueText !== undefined && entry.valueText !== '') return entry.valueText;
  const value = entry.value;
  if (value !== undefined && value !== null && Number.isFinite(value)) return String(value);
  return null;
}

export function AffixList(props: AffixListProps) {
  const { affixes, showTier = true, compact = false, emptyText } = props;
  const { token } = theme.useToken();

  if (affixes.length === 0) {
    return (
      <Typography.Text type="secondary" data-testid="affix-list-empty">
        {emptyText ?? '无词缀'}
      </Typography.Text>
    );
  }

  const rowGap = compact ? token.marginXXS : token.marginXS;
  const inlineGap = compact ? token.marginXXS : token.marginXS;

  return (
    <Flex vertical gap={rowGap} data-testid="affix-list-root" data-compact={compact ? 'true' : 'false'}>
      {orderAffixes(affixes).map((entry, index) => {
        const effects = (entry.effectsTexts ?? []).filter((text) => text.length > 0);
        const valueText = resolveValueText(entry);
        const tierText = showTier && entry.tier !== undefined && Number.isFinite(entry.tier) ? `T${Math.trunc(entry.tier)}` : null;
        return (
          <Flex
            vertical
            key={entry.key ?? `${index}-${entry.name}`}
            gap={token.marginXXS}
            data-testid="affix-list-item"
            data-polarity={entry.polarity ?? 'base'}
          >
            <Flex align="center" wrap gap={inlineGap}>
              <Typography.Text data-testid="affix-list-name">{entry.name}</Typography.Text>
              {tierText === null ? null : <Tag data-testid="affix-list-tier">{tierText}</Tag>}
              {entry.fractured === true ? (
                <Tag color="warning" data-testid="affix-list-fractured">
                  天定
                </Tag>
              ) : null}
              {effects.length === 0 && valueText !== null ? (
                <Typography.Text type="secondary" data-testid="affix-list-value">
                  {valueText}
                </Typography.Text>
              ) : null}
            </Flex>
            {effects.map((text, effectIndex) => (
              <Typography.Text key={`${effectIndex}-${text}`} type="secondary" data-testid="affix-list-effect">
                {text}
              </Typography.Text>
            ))}
          </Flex>
        );
      })}
    </Flex>
  );
}
