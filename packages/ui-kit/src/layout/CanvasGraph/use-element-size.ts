/**
 * `useElementSize` —— 观测一个元素的 **CSS 像素尺寸**（挂载同步一次 + `ResizeObserver` 跟进）。
 *
 * 从 `use-viewport-pose` 抽出来有三个理由：ui-kit 的「单文件 ≤200 行」红线；
 * 它是**与位姿无关**的通用观测（主题切换、右栏折叠都会改容器宽度）；
 * 且它自己能单独测（`use-element-size.test.tsx`）—— 不必为了断言尺寸联动去搭整块画布。
 *
 * 边界：`ref.current` 为 null（未挂载）时返回 `{ w: 0, h: 0 }`；环境没有 `ResizeObserver`
 * （老浏览器 / 精简 jsdom）时退化为「只在挂载时读一次」，绝不抛错。
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
