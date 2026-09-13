/**
 * ResourceBar：百分比文案、四类数值边界（不得出现 NaN/Infinity）、showPercent=false。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ResourceBar } from './index.js';

/** antd v6 Progress 填充轨道（`.ant-progress-track`）宽度（jsdom 下读内联 style）。 */
function barWidth(container: HTMLElement): string {
  return (container.querySelector('.ant-progress-track') as HTMLElement | null)?.style.width ?? '';
}

describe('ResourceBar · 正常区间', () => {
  it('current/max → 百分比文案', () => {
    const { container } = render(<ResourceBar label="修为" current={50} max={200} />);

    expect(screen.getByTestId('resource-bar-root')).toHaveTextContent('修为');
    expect(screen.getByTestId('resource-bar-root')).toHaveTextContent('25%');
    expect(barWidth(container)).toBe('25%');
  });

  it('大于 0 的非整数比例四舍五入到 1 位小数', () => {
    render(<ResourceBar current={1} max={3} />);
    expect(screen.getByTestId('resource-bar-root')).toHaveTextContent('33.3%');
  });
});

describe('ResourceBar · 数值边界（不得 NaN / Infinity）', () => {
  const CASES = [
    { title: 'max=0 → 0%', current: 120, max: 0, expected: '0%' },
    { title: 'current=NaN → 0%', current: Number.NaN, max: 100, expected: '0%' },
    { title: 'current>max → 夹到 100%', current: 999, max: 100, expected: '100%' },
    { title: 'current<0 → 夹到 0%', current: -30, max: 100, expected: '0%' },
    { title: 'max=Infinity → 视为 0（0%）', current: 50, max: Number.POSITIVE_INFINITY, expected: '0%' },
    { title: 'current=undefined → 视为 0', current: undefined, max: 100, expected: '0%' },
  ] as const;

  it.each(CASES)('$title', ({ current, max, expected }) => {
    const { container } = render(<ResourceBar current={current as number} max={max} />);
    const root = screen.getByTestId('resource-bar-root');

    expect(root).toHaveTextContent(expected);
    expect(root.textContent ?? '').not.toMatch(/NaN|Infinity/);
    expect(barWidth(container)).toBe(expected);
    expect(barWidth(container)).not.toMatch(/NaN|Infinity/);
  });

  it('max 与 current 同时为非法值时不抛错且为 0%', () => {
    render(<ResourceBar current={undefined as unknown as number} max={undefined as unknown as number} />);
    expect(screen.getByTestId('resource-bar-root')).toHaveTextContent('0%');
  });
});

describe('ResourceBar · 显示开关与插槽', () => {
  it('showPercent=false 时百分比文案为空', () => {
    const { container } = render(<ResourceBar current={30} max={60} showPercent={false} />);

    expect(container.textContent ?? '').not.toContain('%');
  });

  it('showPercent=false 且有 suffix 时只显示 suffix', () => {
    const { container } = render(
      <ResourceBar current={30} max={60} showPercent={false} suffix={<span>30/60</span>} />,
    );

    expect(container.textContent).toContain('30/60');
    expect(container.textContent ?? '').not.toContain('%');
  });

  it('status 与 tooltip 透传', async () => {
    render(<ResourceBar current={10} max={10} status="success" tooltip="已满" />);

    await userEvent.hover(screen.getByTestId('resource-bar-root'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('已满');
    expect(document.querySelector('.ant-progress-status-success')).not.toBeNull();
  });
});
