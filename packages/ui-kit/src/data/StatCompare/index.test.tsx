/**
 * StatCompare：达标 / 未达标 / 相等 / 小数差额 / 无门槛 / 负数 / 非有限数 /
 * 文案与后缀覆盖 / 提示浮层 / 无障碍。
 *
 * 颜色断言只看 antd 预设状态色 class（`ant-tag-success` / `ant-tag-error`），**不断言 hex**。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StatCompare } from './index.js';

describe('StatCompare · 正常对比', () => {
  it('达标 → 结论「已达标」+ 成功色 + 差额「超出 N」', () => {
    render(<StatCompare label="战力" current={120} target={100} />);

    expect(screen.getByTestId('stat-compare-label')).toHaveTextContent('战力');
    expect(screen.getByTestId('stat-compare-values')).toHaveTextContent('120 / 100');
    expect(screen.getByTestId('stat-compare-delta')).toHaveTextContent('超出 20');

    const verdict = screen.getByTestId('stat-compare-verdict');
    expect(verdict).toHaveTextContent('已达标');
    expect(verdict).toHaveClass('ant-tag-success');
  });

  it('未达标 → 结论「未达标」+ 错误色 + 差额「差 N」', () => {
    render(<StatCompare label="战力" current={80} target={100} />);

    expect(screen.getByTestId('stat-compare-delta')).toHaveTextContent('差 20');

    const verdict = screen.getByTestId('stat-compare-verdict');
    expect(verdict).toHaveTextContent('未达标');
    expect(verdict).toHaveClass('ant-tag-error');
  });

  it('current === target 视为达标，差额「超出 0」', () => {
    render(<StatCompare label="战力" current={100} target={100} />);

    expect(screen.getByTestId('stat-compare-verdict')).toHaveTextContent('已达标');
    expect(screen.getByTestId('stat-compare-delta')).toHaveTextContent('超出 0');
  });

  it.each([
    { current: 7.25, target: 10, delta: '差 2.8' },
    { current: 10, target: 10.3, delta: '差 0.3' },
    { current: 0.1, target: 0.4, delta: '差 0.3' },
    { current: 12.5, target: 10, delta: '超出 2.5' },
  ])('小数差额 $current → $target 保留 1 位并去掉多余 .0：$delta', ({ current, target, delta }) => {
    render(<StatCompare label="修为" current={current} target={target} />);
    expect(screen.getByTestId('stat-compare-delta')).toHaveTextContent(delta);
  });
});

describe('StatCompare · 空 / 无门槛 / 负数边界', () => {
  it.each([
    { current: 0, target: 0 },
    { current: -50, target: 0 },
    { current: -20, target: -10 },
  ])('target<=0（$target）视为无门槛：恒达标且差额 —', ({ current, target }) => {
    render(<StatCompare label="战力" current={current} target={target} />);

    expect(screen.getByTestId('stat-compare-verdict')).toHaveTextContent('已达标');
    expect(screen.getByTestId('stat-compare-delta')).toHaveTextContent('—');
    expect(screen.getByTestId('stat-compare-values')).toHaveTextContent(`${current} / ${target}`);
  });

  it('负数照常参与比较：current=-5 / target=10 → 差 15', () => {
    render(<StatCompare label="灵石" current={-5} target={10} />);

    expect(screen.getByTestId('stat-compare-values')).toHaveTextContent('-5 / 10');
    expect(screen.getByTestId('stat-compare-verdict')).toHaveTextContent('未达标');
    expect(screen.getByTestId('stat-compare-delta')).toHaveTextContent('差 15');
  });
});

describe('StatCompare · 非有限数', () => {
  it.each([
    { current: Number.NaN, target: 100 },
    { current: 100, target: Number.NaN },
    { current: Number.POSITIVE_INFINITY, target: 100 },
    { current: 100, target: Number.NEGATIVE_INFINITY },
  ])('current=$current / target=$target → 数值 —、未达标、差额 —', ({ current, target }) => {
    render(<StatCompare label="战力" current={current} target={target} />);

    const values = screen.getByTestId('stat-compare-values');
    expect(values).toHaveTextContent('—');
    expect(values).not.toHaveTextContent('NaN');
    expect(values).not.toHaveTextContent('Infinity');

    expect(screen.getByTestId('stat-compare-verdict')).toHaveTextContent('未达标');
    expect(screen.getByTestId('stat-compare-verdict')).toHaveClass('ant-tag-error');
    expect(screen.getByTestId('stat-compare-delta')).toHaveTextContent('—');
  });

  it('非有限数优先于「无门槛」：target=0 / current=NaN → 未达标', () => {
    render(<StatCompare label="战力" current={Number.NaN} target={0} />);

    expect(screen.getByTestId('stat-compare-verdict')).toHaveTextContent('未达标');
    expect(screen.getByTestId('stat-compare-delta')).toHaveTextContent('—');
  });
});

describe('StatCompare · 文案与后缀覆盖', () => {
  it('okText / failText 覆盖默认结论文案', () => {
    const { unmount } = render(
      <StatCompare label="战力" current={1} target={10} okText="可入" failText="不足" />,
    );
    expect(screen.getByTestId('stat-compare-verdict')).toHaveTextContent('不足');
    unmount();

    render(<StatCompare label="战力" current={10} target={10} okText="可入" failText="不足" />);
    expect(screen.getByTestId('stat-compare-verdict')).toHaveTextContent('可入');
  });

  it('suffix 追加在数值后', () => {
    render(<StatCompare label="层数" current={3} target={5} suffix="层" />);
    expect(screen.getByTestId('stat-compare-values')).toHaveTextContent('3 / 5 层');
  });
});

describe('StatCompare · 提示浮层与无障碍', () => {
  it('无 tooltip 时不渲染提示入口', () => {
    render(<StatCompare label="战力" current={1} target={2} />);

    expect(screen.queryByTestId('stat-compare-tooltip-trigger')).toBeNull();
    expect(screen.queryByRole('img', { name: '指标说明' })).toBeNull();
  });

  it('tooltip：hover 后浮层出现（交互）', async () => {
    const user = userEvent.setup();
    render(<StatCompare label="战力" current={1} target={2} tooltip="门槛取自秘境前三层" />);

    expect(screen.queryByText('门槛取自秘境前三层')).toBeNull();

    await user.hover(screen.getByRole('img', { name: '指标说明' }));
    await waitFor(() => expect(screen.getByText('门槛取自秘境前三层')).toBeInTheDocument());
  });

  it('结论区可被无障碍读取（role=status，可访问名即结论文案）', () => {
    render(<StatCompare label="战力" current={120} target={100} />);

    const verdict = screen.getByRole('status');
    expect(verdict).toBeInTheDocument();
    expect(verdict).toHaveTextContent('已达标');
    expect(screen.getByTestId('stat-compare-verdict')).toBe(verdict);
  });

  it('提示入口对读屏有可访问名', () => {
    render(<StatCompare label="战力" current={1} target={2} tooltip="说明" />);

    expect(screen.getByRole('img', { name: '指标说明' })).toBeInTheDocument();
  });
});
