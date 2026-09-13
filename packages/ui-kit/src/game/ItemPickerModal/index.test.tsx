/**
 * ItemPickerModal：受控筛选回传、卡片点选、空态、open=false 不渲染、可访问性。
 * 覆盖：正常渲染 / 空数据 / 边界（open=false / 缺省候选）/ 交互（点选 / 输入 / 下拉 / 清空）/ 键盘。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemPickerModal, type ItemPickerFilters } from './index.js';

interface Item {
  id: string;
  name: string;
}

const ITEMS: readonly Item[] = [
  { id: 'i1', name: '青锋剑' },
  { id: 'i2', name: '玄铁刀' },
];

const CATEGORY_OPTIONS = [
  { label: '武器', value: 'weapon' },
  { label: '材料', value: 'material' },
];

const RARITY_OPTIONS = [
  { label: '凡品', value: 0 },
  { label: '灵品', value: 1 },
];

/** 统一 props：用 `Flex` 卡片插槽渲染名称，便于断言点选对象。 */
function renderModal(overrides: Partial<Parameters<typeof ItemPickerModal<Item>>[0]> = {}) {
  return render(
    <ItemPickerModal<Item>
      open
      items={ITEMS}
      renderItem={(item) => <span data-testid={`card-body-${item.id}`}>{item.name}</span>}
      keyOf={(item) => item.id}
      filter={{
        onChange: vi.fn(),
        categoryOptions: CATEGORY_OPTIONS,
        rarityOptions: RARITY_OPTIONS,
      }}
      onPick={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ItemPickerModal · 渲染', () => {
  it('open=true：标题、关键字框、两个下拉、卡片网格与件数齐全', () => {
    renderModal();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('选择物品')).toBeInTheDocument();
    expect(screen.getByTestId('item-picker-keyword')).toBeInTheDocument();
    expect(screen.getByTestId('item-picker-category')).toBeInTheDocument();
    expect(screen.getByTestId('item-picker-rarity')).toBeInTheDocument();
    expect(screen.getByTestId('item-picker-card-i1')).toHaveTextContent('青锋剑');
    expect(screen.getByTestId('item-picker-count')).toHaveTextContent('共 2 件');
    // footer={null}：没有确定 / 取消按钮，只有右上角关闭。
    expect(screen.queryByRole('button', { name: /取\s*消/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /确\s*定/ })).toBeNull();
  });

  it('边界：open=false 时整个弹窗内容不渲染', () => {
    renderModal({ open: false });

    expect(screen.queryByTestId('item-picker-content')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('边界：不传候选时不渲染对应下拉；items=[] 走空态文案', () => {
    const { unmount } = renderModal({ filter: { onChange: vi.fn() } });
    expect(screen.queryByTestId('item-picker-category')).toBeNull();
    expect(screen.queryByTestId('item-picker-rarity')).toBeNull();
    unmount();

    renderModal({ items: [], emptyText: '背包里没有可选的物品' });
    expect(screen.getByText('背包里没有可选的物品')).toBeInTheDocument();
    expect(screen.getByTestId('item-picker-count')).toHaveTextContent('共 0 件');
  });
});

describe('ItemPickerModal · 交互与筛选回传', () => {
  it('交互：点击卡片回调 onPick，且不触发 onCancel', async () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    renderModal({ onPick, onCancel });

    await userEvent.click(screen.getByTestId('item-picker-card-i2'));

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick).toHaveBeenCalledWith(ITEMS[1]);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('键盘：卡片聚焦后回车等价于点选（可访问性）', async () => {
    const onPick = vi.fn();
    renderModal({ onPick });

    const card = screen.getByTestId('item-picker-card-i1');
    expect(card).toHaveAttribute('role', 'button');
    card.focus();
    await userEvent.keyboard('{Enter}');

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick).toHaveBeenCalledWith(ITEMS[0]);
  });

  it('筛选：输入关键字只回调一次，且保留已有筛选值', async () => {
    const onChange = vi.fn();
    renderModal({
      filter: { value: { category: 'weapon' }, onChange, categoryOptions: CATEGORY_OPTIONS },
    });

    // `Input.Search` 的 data-testid 落在最外层容器上，输入目标要下钻到真正的 <input>。
    const input = screen.getByTestId('item-picker-keyword').querySelector('input');
    if (!input) throw new Error('未找到关键字输入框');
    await userEvent.type(input, '青');

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({ category: 'weapon', keyword: '青' });
  });

  it('筛选：选择分类 / 稀有度各回调一次，并回传对应 value', async () => {
    const onChange = vi.fn();
    renderModal({ filter: { value: { keyword: '剑' }, onChange, categoryOptions: CATEGORY_OPTIONS, rarityOptions: RARITY_OPTIONS } });

    await userEvent.click(screen.getByTestId('item-picker-category'));
    await userEvent.click(await screen.findByTitle('武器'));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({ keyword: '剑', category: 'weapon' });

    await userEvent.click(screen.getByTestId('item-picker-rarity'));
    await userEvent.click(await screen.findByTitle('灵品'));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({ keyword: '剑', rarity: 1 });
  });
});

describe('ItemPickerModal · 可访问性', () => {
  it('弹窗为 role=dialog，两个下拉有可读名称，卡片可被读屏定位', () => {
    renderModal();

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('分类')).toBeInTheDocument();
    expect(screen.getByLabelText('稀有度')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /青锋剑/ })).toBeInTheDocument();
  });
});
