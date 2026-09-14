/**
 * LadderProgress：三档状态映射 / 空列表占位 / 标题 / 未知状态保守降级 / 层数保持顺序。
 *
 * 颜色断言只看 antd 语义状态 class（`ant-steps-item-finish` / `-process` / `-wait`），
 * **不断言 hex**（与 `hygiene.test.ts` 的口径一致）。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LadderProgress, type LadderStep } from './index.js';

/** 三层阶梯的常用形状（秘境 3 层）。 */
function threeSteps(overrides: Partial<Record<number, LadderStep['state']>> = {}): LadderStep[] {
  return [0, 1, 2].map((i) => ({
    key: `f${i + 1}`,
    label: `第 ${i + 1} 层`,
    state: overrides[i] ?? 'pending',
  }));
}

/** 取某一层的 `li`（antd Steps 每层一个 `.ant-steps-item`）。 */
function itemOf(container: HTMLElement, index: number): HTMLElement {
  const items = container.querySelectorAll('.ant-steps-item');
  const node = items[index];
  if (!(node instanceof HTMLElement)) throw new Error(`第 ${index} 个阶梯项不存在`);
  return node;
}

describe('LadderProgress · 正常渲染', () => {
  it('按顺序渲染每一层的文案', () => {
    render(<LadderProgress steps={threeSteps({ 0: 'done', 1: 'current' })} />);

    expect(screen.getByTestId('ladder-progress')).toBeInTheDocument();
    expect(screen.getByText('第 1 层')).toBeInTheDocument();
    expect(screen.getByText('第 2 层')).toBeInTheDocument();
    expect(screen.getByText('第 3 层')).toBeInTheDocument();
  });

  it('三档状态分别落到 finish / process / wait', () => {
    const { container } = render(
      <LadderProgress steps={threeSteps({ 0: 'done', 1: 'current', 2: 'pending' })} />,
    );

    expect(itemOf(container, 0)).toHaveClass('ant-steps-item-finish');
    expect(itemOf(container, 1)).toHaveClass('ant-steps-item-process');
    expect(itemOf(container, 2)).toHaveClass('ant-steps-item-wait');
  });

  it('全部未开始（新的一轮）→ 三层都是 wait', () => {
    const { container } = render(<LadderProgress steps={threeSteps()} />);

    for (const index of [0, 1, 2]) {
      expect(itemOf(container, index)).toHaveClass('ant-steps-item-wait');
    }
  });

  it('全部通过（已打满）→ 三层都是 finish', () => {
    const { container } = render(
      <LadderProgress steps={threeSteps({ 0: 'done', 1: 'done', 2: 'done' })} />,
    );

    for (const index of [0, 1, 2]) {
      expect(itemOf(container, index)).toHaveClass('ant-steps-item-finish');
    }
  });

  it('传入 label 时渲染标题行', () => {
    render(<LadderProgress label="突破进度" steps={threeSteps()} />);

    expect(screen.getByText('突破进度')).toBeInTheDocument();
  });

  it('不传 label 时不出现标题行', () => {
    const { container } = render(<LadderProgress steps={threeSteps()} />);

    // 只有台阶文案，没有多余文字层
    expect(container.querySelectorAll('.ant-typography').length).toBe(0);
  });
});

describe('LadderProgress · 边界', () => {
  it('空列表 → 渲染缺省占位符 —', () => {
    render(<LadderProgress steps={[]} />);

    expect(screen.queryByTestId('ladder-progress')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('空列表 + 自定义 emptyText → 用自定义文案', () => {
    render(<LadderProgress steps={[]} emptyText="暂无层数据" />);

    expect(screen.getByText('暂无层数据')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('未知状态（外部脏数据）→ 保守按 wait，不谎报完成', () => {
    const dirty = [{ key: 'f1', label: '第 1 层', state: 'whatever' as LadderStep['state'] }];
    const { container } = render(<LadderProgress steps={dirty} />);

    expect(itemOf(container, 0)).toHaveClass('ant-steps-item-wait');
  });

  it('单层阶梯（maxFloor=1 的秘境）也能渲染', () => {
    const { container } = render(
      <LadderProgress steps={[{ key: 'f1', label: '第 1 层', state: 'current' }]} />,
    );

    expect(container.querySelectorAll('.ant-steps-item').length).toBe(1);
    expect(itemOf(container, 0)).toHaveClass('ant-steps-item-process');
  });

  it('key 决定 React 身份：同 label 的两层不会互相顶掉', () => {
    const { container } = render(
      <LadderProgress
        steps={[
          { key: 'a', label: '同名', state: 'done' },
          { key: 'b', label: '同名', state: 'pending' },
        ]}
      />,
    );

    expect(container.querySelectorAll('.ant-steps-item').length).toBe(2);
    expect(itemOf(container, 0)).toHaveClass('ant-steps-item-finish');
    expect(itemOf(container, 1)).toHaveClass('ant-steps-item-wait');
  });
});