/**
 * ItemCard：名称/阶/稀有度/词缀渲染、空格缀区、actions/footer 插槽、点击与选中态。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ItemCard } from './index.js';

describe('ItemCard · 基础展示', () => {
  it('渲染名称、阶标、稀有度与词缀行', () => {
    render(<ItemCard name="青锋剑" tier={2} rarity={3} meta="兵器/剑" affixTexts={['+12 攻击', '暴击 +3%']} />);

    expect(screen.getByTestId('item-card-name')).toHaveTextContent('青锋剑');
    expect(screen.getByTestId('item-card-tier')).toHaveTextContent('T2');
    expect(screen.getByText('兵器/剑')).toBeInTheDocument();
    expect(screen.getByTestId('rarity-tag')).toHaveTextContent('传奇');
    expect(screen.getByTestId('item-card-affixes')).toHaveTextContent('+12 攻击');
    expect(screen.getByTestId('item-card-affixes')).toHaveTextContent('暴击 +3%');
  });

  it('affixTexts=[] 时不渲染词缀区块', () => {
    render(<ItemCard name="储物袋" affixTexts={[]} />);

    expect(screen.getByTestId('item-card-root')).toBeInTheDocument();
    expect(screen.queryByTestId('item-card-affixes')).not.toBeInTheDocument();
  });

  it('缺省可选字段（tier/rarity/meta/词缀）时只渲染名称，不崩', () => {
    render(<ItemCard name="碎石" />);

    expect(screen.getByTestId('item-card-name')).toHaveTextContent('碎石');
    expect(screen.queryByTestId('item-card-tier')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rarity-tag')).not.toBeInTheDocument();
  });

  it('tier 为非有限数时不渲染阶标', () => {
    render(<ItemCard name="玄铁" tier={Number.NaN} />);
    expect(screen.queryByTestId('item-card-tier')).not.toBeInTheDocument();
  });
});

describe('ItemCard · 插槽与交互', () => {
  it('actions 与 footer 插槽均渲染', () => {
    render(
      <ItemCard
        name="青锋剑"
        actions={<button type="button">装备</button>}
        footer={<span data-testid="custom-footer">耐久 88/100</span>}
      />,
    );

    expect(screen.getByTestId('item-card-actions')).toHaveTextContent('装备');
    expect(screen.getByTestId('item-card-footer')).toHaveTextContent('耐久 88/100');
  });

  it('缺省 footer/actions 时不渲染对应区块', () => {
    render(<ItemCard name="青锋剑" />);

    expect(screen.queryByTestId('item-card-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('item-card-footer')).not.toBeInTheDocument();
  });

  it('点击整卡触发 onClick', async () => {
    const onClick = vi.fn();
    render(<ItemCard name="青锋剑" onClick={onClick} />);

    await userEvent.click(screen.getByTestId('item-card-root'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('selected 标记渲染且不崩（token 表达，不写 hex）', () => {
    render(<ItemCard name="青锋剑" selected />);

    const root = screen.getByTestId('item-card-root');
    expect(root).toHaveAttribute('data-selected', 'true');
    expect(root).toHaveStyle({ borderColor: 'rgb(22, 119, 255)' });
  });
});
