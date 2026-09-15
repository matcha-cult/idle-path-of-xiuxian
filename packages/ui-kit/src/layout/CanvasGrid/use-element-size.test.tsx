/**
 * `useElementSize` / `readDevicePixelRatio` 单测。
 *
 * 纯 canvas 路线把「容器多大 / 屏幕多密」变成了**必须自己量**的输入：canvas 的位图尺寸是
 * 命令式写上去的，量错了不会报错，只会画成空白或模糊。所以这里把边界钉死：
 * 挂载即同步、`ResizeObserver` 跟进、ref 未挂载（0×0 而不是 NaN）、尺寸不变时复用对象、
 * 环境没有 `ResizeObserver` 时退化为「只读一次」、卸载后 `disconnect`。
 *
 * 注意：`getBoundingClientRect` 是**原型方法**，打桩必须每个用例重建，
 * 否则前后用例互相污染（上一轮这个测试文件第一版就踩了）。
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { readDevicePixelRatio, useElementSize } from './use-element-size.js';

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

  it('ResizeObserver 触发时更新尺寸（窗口缩放 / 侧栏折叠都会改容器大小）', () => {
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

  it('尺寸不变时复用同一个对象（避免下游 useMemo/useEffect 白跑）', () => {
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

describe('readDevicePixelRatio', () => {
  function setDpr(value: number | undefined): void {
    Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true, writable: true });
  }

  it('读取真实 DPR（2 倍屏位图要放大 2 倍，否则字和线都是糊的）', () => {
    setDpr(2);
    expect(readDevicePixelRatio()).toBe(2);
    setDpr(1.25);
    expect(readDevicePixelRatio()).toBe(1.25);
  });

  it('非法 DPR（0 / 负数 / NaN / undefined）一律回落 1（否则位图尺寸会变成 0 或 NaN）', () => {
    for (const bad of [0, -1, Number.NaN, undefined]) {
      setDpr(bad);
      expect(readDevicePixelRatio()).toBe(1);
    }
  });
});
