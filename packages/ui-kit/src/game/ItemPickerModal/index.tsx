/**
 * ItemPickerModal —— 从背包选物（筛选 + 卡片网格）。
 *
 * 用途：把「一背包物品」铺进弹窗让玩家点选一件，顶部提供关键字 / 分类 / 稀有度三个筛选入口。
 *
 * 约定：
 * - **组件不筛选**：三个筛选控件都是受控的，用户操作只经 `filter.onChange` 原样回传，
 *   真正的过滤由调用方执行（组件不读 store、不发请求、不持业务状态）；
 * - 卡片复用同包 `ResourceGrid`，并给它 `onClick`/`onKeyDown` 的可点击容器，
 *   点击即 `onPick(item)`，键盘回车 / 空格等效（`role="button"` + `tabIndex=0`）；
 * - `Modal` 用 `footer={null}`（选择即完成，不需要确认按钮）+ `title="选择物品"`；
 * - 颜色只用 token / antd 默认色，不传 `size`。
 *
 * `ItemPickerModalProps` 的合并说明：按规格逐字列出的字段有 11 个（`open` / `items` /
 * `renderItem` / `keyOf` / `filters` / `onFilterChange` / `categoryOptions` /
 * `rarityOptions` / `onPick` / `onCancel` / `filter` 之外的其余项），超出本仓
 * 「props ≤10」硬约束。因此把**同一件事**的四个字段（筛选值 + 变更回调 + 两组候选）
 * 收进一个对象 prop `filter`，其余字段保持逐字不变。
 *
 * 边界：
 * - `items=[]` → `ResourceGrid` 渲染空态（`emptyText` 覆盖文案）；
 * - `open=false` → 整个弹窗内容不渲染；
 * - 任一筛选变化只回调**一次**（不回传合成事件、不在 effect 里补发），清空即回传 `undefined`；
 * - 未传 `categoryOptions` / `rarityOptions` 时，对应的 `Select` 不渲染。
 */
import { Flex, Input, Modal, Select, Typography, theme } from 'antd';
import type { ReactNode } from 'react';
import { ResourceGrid } from '../../data/ResourceGrid/index.js';

export interface ItemPickerFilterOption {
  label: ReactNode;
  value: string | number;
}

export interface ItemPickerFilters {
  category?: string | number;
  rarity?: string | number;
  keyword?: string;
}

/** 筛选组：受控取值 + 变更回调 + 两组候选项（合并原因见文件头注释）。 */
export interface ItemPickerFilterGroup {
  /** 当前筛选值（受控；组件不自行过滤）。 */
  value?: ItemPickerFilters;
  /** 筛选变化回调（每次用户操作恰好回调一次）。 */
  onChange?: (filters: ItemPickerFilters) => void;
  /** 分类候选；不传则不渲染分类下拉。 */
  categoryOptions?: readonly ItemPickerFilterOption[];
  /** 稀有度候选；不传则不渲染稀有度下拉。 */
  rarityOptions?: readonly ItemPickerFilterOption[];
}

export interface ItemPickerModalProps<T> {
  open: boolean;
  items: readonly T[];
  /** 卡片渲染（调用方给，通常 ResourceGrid 的 renderItem）。 */
  renderItem: (item: T) => ReactNode;
  keyOf: (item: T) => string;
  /** 受控筛选值（组件不做筛选，只回调；筛选由调用方执行）。 */
  filter?: ItemPickerFilterGroup;
  onPick: (item: T) => void;
  onCancel: () => void;
  /** 空态文案。 */
  emptyText?: ReactNode;
}

/** 卡片网格滚动区高度占「较高控件高度」的倍数，避免弹窗被长背包撑满屏。 */
const GRID_SCROLL_CONTROL_HEIGHTS = 8;

export function ItemPickerModal<T>(props: ItemPickerModalProps<T>) {
  const { open, items, renderItem, keyOf, filter, onPick, onCancel, emptyText } = props;
  const { token } = theme.useToken();

  const value = filter?.value ?? {};
  const { categoryOptions, rarityOptions } = filter ?? {};

  /** 合并式筛选变更：一次用户操作 → 恰好一次 `onChange`。 */
  const change = (patch: ItemPickerFilters): void => {
    filter?.onChange?.({ ...value, ...patch });
  };

  return (
    <Modal
      open={open}
      title="选择物品"
      footer={null}
      onCancel={onCancel}
      data-testid="item-picker-modal-root"
    >
      <Flex vertical gap={token.marginSM} data-testid="item-picker-content">
        <Flex wrap gap={token.marginSM} align="center">
          <Input.Search
            data-testid="item-picker-keyword"
            placeholder="搜索名称"
            allowClear
            value={value.keyword}
            onChange={(event) => change({ keyword: event.target.value })}
          />
          {categoryOptions ? (
            <Select
              data-testid="item-picker-category"
              aria-label="分类"
              placeholder="分类"
              allowClear
              options={[...categoryOptions]}
              value={value.category}
              onChange={(next) => change({ category: next })}
            />
          ) : null}
          {rarityOptions ? (
            <Select
              data-testid="item-picker-rarity"
              aria-label="稀有度"
              placeholder="稀有度"
              allowClear
              options={[...rarityOptions]}
              value={value.rarity}
              onChange={(next) => change({ rarity: next })}
            />
          ) : null}
        </Flex>
        <Flex
          vertical
          data-testid="item-picker-grid"
          style={{
            maxHeight: token.controlHeightLG * GRID_SCROLL_CONTROL_HEIGHTS,
            overflowY: 'auto',
          }}
        >
          <ResourceGrid
            items={items}
            renderItem={(item) => (
              <Flex
                vertical
                role="button"
                tabIndex={0}
                data-testid={`item-picker-card-${keyOf(item)}`}
                onClick={() => onPick(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onPick(item);
                  }
                }}
              >
                {renderItem(item)}
              </Flex>
            )}
            keyOf={(item) => keyOf(item)}
            emptyText={emptyText ?? '没有可选物品'}
          />
        </Flex>
        <Typography.Text type="secondary" data-testid="item-picker-count">
          共 {items.length} 件
        </Typography.Text>
      </Flex>
    </Modal>
  );
}
