/**
 * LockedHint：三种原因默认文案 / 需要·当前行 / 0 与缺省边界 / 非有限数 /
 * hint 覆盖 / 无障碍。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LockedHint, type LockedReason } from './index.js';

describe('LockedHint · 原因默认文案', () => {
  it.each([
    ['realm', '境界不足'],
    ['prev', '需先推进前置秘境'],
    ['objective', '条件未满足'],
  ] as const)('reason=%s → 说明「%s」', (reason, text) => {
    render(<LockedHint title="秘境：落霞谷" reason={reason} />);

    expect(screen.getByTestId('locked-hint-root')).toHaveTextContent('秘境：落霞谷');
    expect(screen.getByTestId('locked-hint-description')).toHaveTextContent(text);
  });

  it('三种原因文案互不相同（覆盖全部 LockedReason 分支）', () => {
    const reasons: readonly LockedReason[] = ['realm', 'prev', 'objective'];
    const texts = reasons.map((reason) => {
      const { unmount } = render(<LockedHint title="x" reason={reason} />);
      const text = screen.getByTestId('locked-hint-description').textContent;
      unmount();
      return text;
    });

    expect(new Set(texts).size).toBe(3);
  });
});

describe('LockedHint · 需要 / 当前行', () => {
  it('两者都给 → 「需要 5 · 当前 3」', () => {
    render(<LockedHint title="秘境：落霞谷" reason="realm" required={5} current={3} />);
    expect(screen.getByTestId('locked-hint-requirement')).toHaveTextContent('需要 5 · 当前 3');
  });

  it('只给 required → 只显示「需要 5」', () => {
    render(<LockedHint title="秘境：落霞谷" reason="objective" required={5} />);

    const line = screen.getByTestId('locked-hint-requirement');
    expect(line).toHaveTextContent('需要 5');
    expect(line).not.toHaveTextContent('当前');
  });

  it('required=0 / current=0 不被 falsy 判断吞掉', () => {
    render(<LockedHint title="秘境：落霞谷" reason="realm" required={0} current={0} />);
    expect(screen.getByTestId('locked-hint-requirement')).toHaveTextContent('需要 0 · 当前 0');
  });

  it('都不给 → 不渲染该行，且不出现 undefined / null 字样', () => {
    render(<LockedHint title="秘境：落霞谷" reason="prev" />);

    expect(screen.queryByTestId('locked-hint-requirement')).toBeNull();
    const root = screen.getByTestId('locked-hint-root');
    expect(root).not.toHaveTextContent('undefined');
    expect(root).not.toHaveTextContent('null');
  });

  it.each([
    { required: Number.NaN, current: 3 },
    { required: 5, current: Number.NaN },
    { required: Number.POSITIVE_INFINITY, current: 3 },
    { required: 5, current: Number.NEGATIVE_INFINITY },
  ])('非有限数（required=$required / current=$current）→ 该行显示 —', ({ required, current }) => {
    render(<LockedHint title="秘境：落霞谷" reason="realm" required={required} current={current} />);

    const line = screen.getByTestId('locked-hint-requirement');
    expect(line).toHaveTextContent('—');
    expect(line).not.toHaveTextContent('NaN');
    expect(line).not.toHaveTextContent('Infinity');
  });
});

describe('LockedHint · hint 覆盖与无障碍', () => {
  it('hint 优先作为 description（默认原因文案不再显示）', () => {
    render(
      <LockedHint
        title="秘境：青云山脚"
        reason="prev"
        required={5}
        current={3}
        hint="需先推进：青云山脚 第 5 层"
      />,
    );

    expect(screen.getByTestId('locked-hint-description')).toHaveTextContent('需先推进：青云山脚 第 5 层');
    expect(screen.queryByText('需先推进前置秘境')).toBeNull();
    expect(screen.getByTestId('locked-hint-requirement')).toHaveTextContent('需要 5 · 当前 3');
  });

  it('以 role=alert 呈现（可访问性），且带标题与说明', () => {
    render(<LockedHint title="秘境：落霞谷" reason="realm" required={5} current={3} />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('秘境：落霞谷');
    expect(alert).toHaveTextContent('境界不足');
    expect(alert).toBe(screen.getByTestId('locked-hint-root'));
  });
});
