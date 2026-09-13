/**
 * ItemCard —— 物品展示卡（名称 / 阶 / 稀有度 / 词缀 / 动作插槽），游戏语义通用组。
 *
 * 用途：背包、装备、商店、掉落结算等所有「一件物品」的展示。
 * 约定：
 * - 结构只用 antd `Card` + `Space` + `Typography` 组合，不写裸 `div` 布局；
 * - 稀有度复用同组 `RarityTag`（不重复实现色板）；
 * - 选中态用 `theme.useToken()` 的 token 表达（`colorPrimary` / `colorPrimaryBorder`），禁 hex；
 * - 词缀与动作全部由 props 注入，组件不含任何游戏数值/公式。
 *
 * 插槽：`actions`（卡体底部操作区）、`footer`（卡体最底部补充区）。
 * 边界：`affixTexts` 为空数组时不渲染词缀区块；`tier` 非有限数时不渲染阶标；
 *       `rarity` 缺省时不渲染 `RarityTag`。
 *
 * 偏离说明：antd v6 的 `Card` **没有** `footer` prop（已核对 `card/Card.d.ts`），
 * 因此 `footer` 渲染为卡体垂直栈的最末区块（`data-testid="item-card-footer"`），
 * props 契约不变。
 *
 * 实现说明：纵向 `Space` 用 antd v6 的 `orientation="vertical"`（`direction` 在 v6 已弃用）。
 */
import { Card, Space, theme, Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { RarityTag } from '../RarityTag/index.js';

export interface ItemCardProps {
  /** 物品名（第一行主文案）。 */
  name: ReactNode;
  /** 阶数，显示为 `T{n}`；缺省或非有限数时不渲染。 */
  tier?: number;
  /** 稀有度（0..3），透传给同组 `RarityTag`；缺省时不渲染。 */
  rarity?: number;
  /** 第二行补充信息（品类 / 槽位 / 来源等）。 */
  meta?: ReactNode;
  /** 词缀行列表；空数组时不渲染词缀区块。 */
  affixTexts?: readonly string[];
  /** 卡体底部操作插槽（如「装备 / 出售」按钮）。 */
  actions?: ReactNode;
  /** 卡体最底部的补充区（antd v6 `Card` 无 footer prop，渲染为末尾区块）。 */
  footer?: ReactNode;
  /** 选中态：用主色边框 token 表达，不写 hex。 */
  selected?: boolean;
  /** 点击整卡回调；缺省时卡片不可点（不显示 hover 反馈）。 */
  onClick?: () => void;
}

export function ItemCard(props: ItemCardProps) {
  const { name, tier, rarity, meta, affixTexts, actions, footer, selected, onClick } = props;
  const { token } = theme.useToken();

  const selectedStyle: CSSProperties | undefined = selected
    ? { borderColor: token.colorPrimary, boxShadow: `0 0 0 1px ${token.colorPrimaryBorder}` }
    : undefined;

  const showTier = tier !== undefined && Number.isFinite(tier);
  const affixes = affixTexts ?? [];

  return (
    <Card
      data-testid="item-card-root"
      data-selected={selected === true ? 'true' : 'false'}
      variant="outlined"
      hoverable={onClick !== undefined}
      onClick={onClick}
      style={selectedStyle}
    >
      <Space orientation="vertical">
        <Space align="center" wrap>
          <Typography.Text strong data-testid="item-card-name">
            {name}
          </Typography.Text>
          {showTier ? (
            <Typography.Text type="secondary" data-testid="item-card-tier">
              {`T${Math.trunc(tier)}`}
            </Typography.Text>
          ) : null}
          {rarity !== undefined ? <RarityTag rarity={rarity} /> : null}
        </Space>
        {meta !== undefined && meta !== null ? <Typography.Text type="secondary">{meta}</Typography.Text> : null}
        {affixes.length > 0 ? (
          <Space orientation="vertical" data-testid="item-card-affixes">
            {affixes.map((text, index) => (
              <Typography.Text key={`${index}-${text}`} type="secondary">
                {text}
              </Typography.Text>
            ))}
          </Space>
        ) : null}
        {actions !== undefined && actions !== null ? (
          <Space data-testid="item-card-actions">{actions}</Space>
        ) : null}
        {footer !== undefined && footer !== null ? (
          <Space data-testid="item-card-footer">{footer}</Space>
        ) : null}
      </Space>
    </Card>
  );
}
