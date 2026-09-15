/**
 * `useElementSize` —— 观测一个元素的 **CSS 像素尺寸**（挂载同步一次 + `ResizeObserver` 跟进）。
 *
 * 纯 canvas 路线的第一步就要它：canvas 的位图尺寸是**命令式**的（`canvas.width = …`），
 * 不像 CSS 那样能自己撑开，所以「容器多大」必须由 JS 量出来，且窗口/侧栏变化时要跟着量。
 *
 * 边界（都有单测）：`ref.current` 为 null（未挂载）⇒ `{0, 0}`；
 * 环境没有 `ResizeObserver`（老浏览器 / 精简 jsdom）⇒ 退化成「只读一次」，绝不抛错；
 * 尺寸未变时**复用同一个对象**，避免下游 useMemo/useEffect 白跑。
 */
import { useLayoutEffect, useState } from 'react';
import type { MutableRefObject } from 'react';

export interface ElementSize {
  w: number;
  h: number;
}

/** 元素缺省尺寸：0 表示「还不知道」，调用方据此跳过依赖尺寸的计算。 */
export const UNKNOWN_SIZE: ElementSize = { w: 0, h: 0 };

export function useElementSize(ref: MutableRefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>(UNKNOWN_SIZE);

  useLayoutEffect(() => {
    const host = ref.current;
    if (host === null) return;
    const sync = (): void => {
      const rect = host.getBoundingClientRect();
      setSize((prev) => (prev.w === rect.width && prev.h === rect.height ? prev : { w: rect.width, h: rect.height }));
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(host);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

/**
 * 当前设备的 `devicePixelRatio`，**在渲染期直接读**（不是 state）。
 *
 * 取舍：DPR 变化（拖到不同缩放的显示器）几乎总伴随一次窗口尺寸变化，而窗口变化会经
 * `useElementSize` 触发重渲染 —— 于是这里读到的必然是新值，无需再挂 `matchMedia` 监听。
 * 非法值（0 / NaN / 非数）一律回落到 1，否则位图尺寸会变成 0 或 NaN，画布直接消失。
 */
export function readDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  const ratio = window.devicePixelRatio;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}
