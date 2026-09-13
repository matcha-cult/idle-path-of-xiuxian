/**
 * RarityTag：四档文案 / 预设色名 / clamp 边界 / 覆盖文案回退。
 *
 * 颜色断言只看 antd 预设色 class（`ant-tag-{color}`），**不断言 hex**。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RARITY_LABELS, RarityTag } from './index.js';

const LEGAL_CASES = [
  { rarity: 0, label: '凡品', color: 'default' },
  { rarity: 1, label: '灵品', color: 'green' },
  { rarity: 2, label: '宝品', color: 'gold' },
  { rarity: 3, label: '传奇', color: 'red' },
] as const;

describe('RarityTag · 四档合法值', () => {
  it.each(LEGAL_CASES)('rarity=$rarity → 文案「$label」+ 预设色 $color', ({ rarity, label, color }) => {
    render(<RarityTag rarity={rarity} />);

    const tag = screen.getByTestId('rarity-tag');
    expect(tag).toHaveTextContent(label);
    expect(tag).toHaveAttribute('data-rarity', String(rarity));
    expect(tag).toHaveAttribute('data-color', color);
    expect(tag).toHaveClass(`ant-tag-${color}`);
  });

  it('默认文案常量即四档中文名', () => {
    expect(RARITY_LABELS).toEqual(['凡品', '灵品', '宝品', '传奇']);
  });
});

describe('RarityTag · 边界 clamp 到 0..3', () => {
  it.each([
    { input: Number.NaN, expected: 0, label: '凡品' },
    { input: -1, expected: 0, label: '凡品' },
    { input: 0.4, expected: 0, label: '凡品' },
    { input: 3.7, expected: 3, label: '传奇' },
    { input: 99, expected: 3, label: '传奇' },
    { input: Number.POSITIVE_INFINITY, expected: 0, label: '凡品' },
  ])('rarity=$input → 档位 $expected', ({ input, expected, label }) => {
    render(<RarityTag rarity={input} />);

    const tag = screen.getByTestId('rarity-tag');
    expect(tag).toHaveAttribute('data-rarity', String(expected));
    expect(tag).toHaveTextContent(label);
  });

  it('undefined（越出类型契约的运行期入参）→ 按 0 处理', () => {
    render(<RarityTag rarity={undefined as unknown as number} />);
    expect(screen.getByTestId('rarity-tag')).toHaveAttribute('data-rarity', '0');
  });
});

describe('RarityTag · 显示开关与自定义文案', () => {
  it('showLabel=false 只显示 R{n} 徽标', () => {
    render(<RarityTag rarity={2} showLabel={false} />);

    const tag = screen.getByTestId('rarity-tag');
    expect(tag).toHaveTextContent('R3');
    expect(tag).not.toHaveTextContent('宝品');
  });

  it('labels 覆盖四档文案', () => {
    const labels = ['白', '绿', '蓝', '橙'] as const;
    render(
      <>
        <RarityTag rarity={0} labels={labels} />
        <RarityTag rarity={3} labels={labels} />
      </>,
    );

    const tags = screen.getAllByTestId('rarity-tag');
    expect(tags[0]).toHaveTextContent('白');
    expect(tags[1]).toHaveTextContent('橙');
  });

  it('labels 长度不足 4 位时，缺失位回退 RARITY_LABELS', () => {
    render(<RarityTag rarity={2} labels={['白', '绿']} />);
    expect(screen.getByTestId('rarity-tag')).toHaveTextContent('宝品');
  });

  it('bordered=false 透传给 antd Tag（落到 filled variant，不写 hex）', () => {
    // antd v6 对 bordered 发出弃用提示，这里只关心透传结果，屏蔽该提示噪声。
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(<RarityTag rarity={1} bordered={false} />);
      expect(screen.getByTestId('rarity-tag')).toHaveClass('ant-tag-filled');
    } finally {
      spy.mockRestore();
    }
  });
});
