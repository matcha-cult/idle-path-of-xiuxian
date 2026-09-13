/**
 * AffixList：名称 / T 阶 / 天定标记、文本优先级（effectsTexts > valueText > value）、
 * polarity 分组排序、紧凑模式，以及 `[]` / `tier=0` / `value=0` / `value=null` 等边界。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AffixList } from './index.js';

describe('AffixList · 基础展示', () => {
  it('正常渲染：名称 + T 阶 + 天定标记 + 数值', () => {
    render(<AffixList affixes={[{ name: '锋利', tier: 3, value: 12, fractured: true }]} />);

    expect(screen.getByTestId('affix-list-root')).toBeInTheDocument();
    expect(screen.getByTestId('affix-list-name')).toHaveTextContent('锋利');
    expect(screen.getByTestId('affix-list-tier')).toHaveTextContent('T3');
    expect(screen.getByTestId('affix-list-fractured')).toHaveTextContent('天定');
    expect(screen.getByTestId('affix-list-value')).toHaveTextContent('12');
  });

  it('effectsTexts 优先于 valueText / value，并逐条展示', () => {
    render(
      <AffixList
        affixes={[
          {
            name: '破甲',
            value: 9,
            valueText: '9 点',
            effectsTexts: ['无视 30% 护甲', '攻击 +12'],
          },
        ]}
      />,
    );

    const effects = screen.getAllByTestId('affix-list-effect').map((node) => node.textContent);
    expect(effects).toEqual(['无视 30% 护甲', '攻击 +12']);
    expect(screen.queryByTestId('affix-list-value')).toBeNull();
  });

  it('effectsTexts 为空数组时回落：valueText 优先于 value', () => {
    render(<AffixList affixes={[{ name: '锋锐', value: 9, valueText: '9 点', effectsTexts: [] }]} />);

    expect(screen.getByTestId('affix-list-value')).toHaveTextContent('9 点');
    expect(screen.queryByTestId('affix-list-effect')).toBeNull();
  });

  it('空列表：渲染缺省「无词缀」，可用 emptyText 覆盖', () => {
    const { unmount } = render(<AffixList affixes={[]} />);
    expect(screen.getByTestId('affix-list-empty')).toHaveTextContent('无词缀');
    unmount();

    render(<AffixList affixes={[]} emptyText="暂无词条" />);
    expect(screen.getByTestId('affix-list-empty')).toHaveTextContent('暂无词条');
    expect(screen.queryByTestId('affix-list-root')).toBeNull();
  });
});

describe('AffixList · 边界', () => {
  it('tier=0 显示 T0（不被 falsy 吞），value=0 显示 0', () => {
    render(<AffixList affixes={[{ name: '基石', tier: 0, value: 0 }]} />);

    expect(screen.getByTestId('affix-list-tier')).toHaveTextContent('T0');
    expect(screen.getByTestId('affix-list-value')).toHaveTextContent('0');
  });

  it('value 为 null / 缺失 / 非有限数时只显示名字', () => {
    const { unmount } = render(<AffixList affixes={[{ name: '无名', value: null }]} />);
    expect(screen.getByTestId('affix-list-name')).toHaveTextContent('无名');
    expect(screen.queryByTestId('affix-list-value')).toBeNull();
    unmount();

    const { unmount: unmount2 } = render(<AffixList affixes={[{ name: '无值' }, { name: '非数', value: Number.NaN }]} />);
    expect(screen.queryByTestId('affix-list-value')).toBeNull();
    unmount2();

    render(<AffixList affixes={[{ name: '空文本', valueText: '' }]} />);
    expect(screen.queryByTestId('affix-list-value')).toBeNull();
  });

  it('showTier=false 或 tier 非有限数时不渲染 T 阶', () => {
    const { unmount } = render(<AffixList affixes={[{ name: '锋利', tier: 2 }]} showTier={false} />);
    expect(screen.queryByTestId('affix-list-tier')).toBeNull();
    unmount();

    render(<AffixList affixes={[{ name: '锋利', tier: Number.NaN }]} />);
    expect(screen.queryByTestId('affix-list-tier')).toBeNull();
  });

  it('polarity 分组：prefix 在前、suffix 在后、base / 未知居中且组内保序', () => {
    render(
      <AffixList
        affixes={[
          { name: '后缀甲', polarity: 'suffix' },
          { name: '中性甲' },
          { name: '前缀甲', polarity: 'prefix' },
          { name: '前缀乙', polarity: 'prefix' },
          { name: '未知', polarity: 'weird' },
        ]}
      />,
    );

    expect(screen.getAllByTestId('affix-list-name').map((node) => node.textContent)).toEqual([
      '前缀甲',
      '前缀乙',
      '中性甲',
      '未知',
      '后缀甲',
    ]);
    expect(screen.getAllByTestId('affix-list-item').map((node) => node.getAttribute('data-polarity'))).toEqual([
      'prefix',
      'prefix',
      'base',
      'weird',
      'suffix',
    ]);
  });

  it('compact 只影响根节点标记（缺省 false），key 为 null 时不崩', () => {
    const { unmount } = render(
      <AffixList affixes={[{ name: '锋利', key: null }, { name: '坚韧' }]} />,
    );
    expect(screen.getByTestId('affix-list-root')).toHaveAttribute('data-compact', 'false');
    expect(screen.getAllByTestId('affix-list-item')).toHaveLength(2);
    unmount();

    render(<AffixList affixes={[{ name: '锋利', key: 'affix-1' }]} compact />);
    expect(screen.getByTestId('affix-list-root')).toHaveAttribute('data-compact', 'true');
  });
});
