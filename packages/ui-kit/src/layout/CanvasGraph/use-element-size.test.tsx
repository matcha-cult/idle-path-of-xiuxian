/**
 * `useElementSize` 单测 —— 尺寸观测是画布「整图适配」的输入，必须覆盖：
 * 挂载即同步、`ResizeObserver` 回调跟进、**ref 未挂载**（0×0 而非 NaN）、
 * 以及**环境没有 ResizeObserver** 时退化为「只读一次」而不抛错。
 *
 * 注意：`getBoundingClientRect` 是**原型方法**，打桩必须在每个用例前重建，
 * 否则前后用例互相污染（这个测试文件第一版就踩了）。
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useElementSize } from './use-element-size.js';

const VIEW = { w: 660, h: 420 };

function rect(w: number, h: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: w,
    bottom: h,
    width: w,
    height: h,
    toJSON: () => ({}),
  } as DOMRect;
}

/** 当前生效的「容器尺寸」；用例里改它即可模拟布局变化。 */
let current = rect(VIEW.w, VIEW.h);

beforeEach(() => {
  current = rect(VIEW.w, VIEW.h);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => current);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Host(): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const size = useElementSize(ref);
  return <div ref={ref} data-testid="host" data-w={size.w} data-h={size.h} />;
}

/** 不挂 ref 的宿主：模拟「还没挂载 / 条件渲染」的边界。 */
function NoRefHost(): React.ReactElement {
  const ref = useRef<HTMLElement | null>(null);
  const size = useElementSize(ref);
  return <div data-testid="noref" data-w={size.w} data-h={size.h} />;
}

describe('useElementSize', () => {
  it('挂载即同步一次真实尺寸', () => {
    render(<Host />);
    const host = screen.getByTestId('host');
    expect(host.getAttribute('data-w')).toBe('660');
    expect(host.getAttribute('data-h')).toBe('420');
  });

  it('ref 未挂载 → 0×0（而不是 NaN，NaN 会让整块画布消失）', () => {
    render(<NoRefHost />);
    const host = screen.getByTestId('noref');
    expect(host.getAttribute('data-w')).toBe('0');
    expect(host.getAttribute('data-h')).toBe('0');
  });

  it('ResizeObserver 触发时更新尺寸（右栏折叠 / 主题切换都会改容器宽度）', () => {
    const callbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    render(<Host />);
    expect(callbacks).toHaveLength(1);
    current = rect(320, 200);
    act(() => {
      callbacks[0]?.([], {} as ResizeObserver);
    });
    const host = screen.getByTestId('host');
    expect(host.getAttribute('data-w')).toBe('320');
    expect(host.getAttribute('data-h')).toBe('200');
  });

  it('尺寸不变时复用同一个对象（避免下游无谓重渲染）', () => {
    const seen: unknown[] = [];
    function Probe(): React.ReactElement {
      const ref = useRef<HTMLDivElement | null>(null);
      const size = useElementSize(ref);
      seen.push(size);
      return <div ref={ref} data-testid="probe" />;
    }
    const { rerender } = render(<Probe />);
    rerender(<Probe />);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    // 首帧是 UNKNOWN_SIZE，之后都是同一个「已测量」对象
    expect(seen.at(-1)).toBe(seen.at(-2));
  });

  it('环境没有 ResizeObserver（老浏览器 / 精简 jsdom）→ 只读一次，不抛错', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    expect(() => render(<Host />)).not.toThrow();
    expect(screen.getByTestId('host').getAttribute('data-w')).toBe('660');
  });

  it('卸载后 observer 被 disconnect（不留悬挂回调）', () => {
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect = disconnect;
      },
    );
    const { unmount } = render(<Host />);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
