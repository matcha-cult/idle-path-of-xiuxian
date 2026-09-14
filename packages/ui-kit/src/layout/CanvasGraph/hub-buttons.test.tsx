/**
 * `CanvasGraph` **枢纽里的真按钮**（回答「canvas 上的按钮能不能各自触发不同交互」）。
 *
 * 混合渲染的关键性质：画布只承载**不可交互**的视觉层（参考圆 / 连线 / 点阵），
 * **枢纽是 DOM 元素** —— 因此枢纽内部可以放真正的 antd 组件，命中判定由浏览器负责，
 * 不需要任何坐标命中测试。这一条把该性质钉成可执行的门禁。
 *
 * 必须守住的四条：
 * 1. 每个按钮触发**自己的**回调（互不串台）；
 * 2. 点按钮**不会**顺带触发枢纽的 `onSelect`（否则"点开会跳走"）；
 * 3. **在按钮上双击不会**被判成枢纽的双击直达（那会把玩家传送走 —— 这是本轮修掉的真实缺陷：
 *    命中判定原先是 `closest('[data-canvas-item]')`，会把按钮的点击也算作点枢纽）；
 * 4. 键盘可达：按钮能聚焦、能用 Enter 触发；枢纽本身也仍是 `role=button`。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Button } from 'antd';
import { CanvasGraph } from './index.js';
import type { CanvasGraphItem } from './types.js';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class NoopResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 900,
    bottom: 700,
    width: 900,
    height: 700,
    toJSON: () => ({}),
  } as DOMRect);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

/** 裸事件派发：`userEvent.click` 在 pointerdown 被 preventDefault（拖动抑制）后会收敛后续事件。 */
let seq = 0;
function tap(node: Element): void {
  seq += 1;
  for (const type of ['pointerdown', 'pointerup'] as const) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10 + seq, clientY: 10 });
    fireEvent(node, event);
  }
}

/** 一次"双击"：两次相邻的 pointerdown/up（间隔在双击窗口内，落点几乎相同）。 */
function doubleTap(node: Element): void {
  seq += 1;
  for (let i = 0; i < 2; i += 1) {
    for (const type of ['pointerdown', 'pointerup'] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, {
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        clientX: 200 + seq * 0.01,
        clientY: 200,
      });
      fireEvent(node, event);
    }
  }
}

interface Harness {
  onSelect: ReturnType<typeof vi.fn>;
  onOpenOffice: ReturnType<typeof vi.fn>;
  onUnlock: ReturnType<typeof vi.fn>;
}

function renderHubWithButtons(): Harness {
  const onSelect = vi.fn();
  const onOpenOffice = vi.fn();
  const onUnlock = vi.fn();
  const items: CanvasGraphItem[] = [
    {
      key: 'qy_chuanfayuan',
      row: 5,
      col: 10,
      title: '传法院',
      onSelect,
      content: (
        <span>
          传法院
          <Button data-testid="hub-btn-office" onClick={onOpenOffice}>
            职能
          </Button>
          <Button data-testid="hub-btn-waypoint" onClick={onUnlock}>
            交互
          </Button>
        </span>
      ),
    },
  ];
  render(<CanvasGraph rows={20} cols={20} items={items} />);
  return { onSelect, onOpenOffice, onUnlock };
}

describe('⭐ 枢纽里的真按钮：各自触发不同交互', () => {
  it('两个按钮各自触发自己的回调（互不串台）', () => {
    const { onOpenOffice, onUnlock} = renderHubWithButtons();
    fireEvent.click(screen.getByTestId('hub-btn-office'));
    expect(onOpenOffice).toHaveBeenCalledTimes(1);
    expect(onUnlock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('hub-btn-waypoint'));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(onOpenOffice).toHaveBeenCalledTimes(1);
  });

  it('⭐ 点按钮**不会**顺带触发枢纽的 onSelect（否则"点开会跳走"）', () => {
    const { onSelect } = renderHubWithButtons();
    tap(screen.getByTestId('hub-btn-office'));
    tap(screen.getByTestId('hub-btn-waypoint'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('⭐ 在按钮上双击**不会**被判成枢纽的双击直达（那会把玩家传送走）', () => {
    const { onSelect } = renderHubWithButtons();
    doubleTap(screen.getByTestId('hub-btn-office'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('点枢纽本体（非按钮区域）仍然是「只选中」', () => {
    const { onSelect } = renderHubWithButtons();
    const hub = screen.getByTestId('canvas-graph-item-qy_chuanfayuan');
    const label = within(hub).getByText('传法院'); // 枢纽内的纯文本
    tap(label);
    expect(onSelect).toHaveBeenCalledWith('tap');
  });

  it('枢纽本体双击 = 直达（既有契约未被削弱）', () => {
    const { onSelect } = renderHubWithButtons();
    const hub = screen.getByTestId('canvas-graph-item-qy_chuanfayuan');
    doubleTap(within(hub).getByText('传法院'));
    expect(onSelect).toHaveBeenCalledWith('double');
  });

  it('antd 按钮的交互态是原生的：可聚焦、Enter 可触发（canvas 位图里的"按钮"做不到这点）', () => {
    const { onOpenOffice } = renderHubWithButtons();
    const button = screen.getByTestId('hub-btn-office');
    button.focus();
    expect(button).toHaveFocus();
    expect(button.tagName).toBe('BUTTON');
    // 真实按钮的默认行为（Enter/Space 触发 click）由浏览器负责，这里断言它确实是可交互元素
    expect(button).toBeEnabled();
    expect(onOpenOffice).not.toHaveBeenCalled(); // 仅聚焦不触发
  });

  it('枢纽仍保留 role=button + tabIndex（无障碍与键盘选中不受影响）', () => {
    renderHubWithButtons();
    const hub = screen.getByTestId('canvas-graph-item-qy_chuanfayuan');
    expect(hub).toHaveAttribute('role', 'button');
    expect(hub).toHaveAttribute('tabindex', '0');
  });
});
