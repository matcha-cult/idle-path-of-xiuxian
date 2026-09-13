/**
 * `resolveMapDebug` 的边界：`1` / `0` / 无参数 × DEV / 非法值 / 前缀与重复参数 / 畸形串。
 *
 * 这条规则的价值在于「优先级不能错」：`?mapGrid=0` 在开发构建下必须能关掉网格，
 * 否则调布局时反而被网格挡住；`?mapGrid=x` 必须回退而不是当成真。
 */
import { describe, expect, it } from 'vitest';
import { MAP_GRID_PARAM, resolveMapDebug } from './debug-flags.js';

describe('resolveMapDebug · URL 参数优先', () => {
  it('?mapGrid=1 → 开（开发与正式构建都开）', () => {
    expect(resolveMapDebug({ DEV: true }, '?mapGrid=1')).toEqual({ showGrid: true });
    expect(resolveMapDebug({ DEV: false }, '?mapGrid=1')).toEqual({ showGrid: true });
    expect(resolveMapDebug({}, '?mapGrid=1')).toEqual({ showGrid: true });
  });

  it('?mapGrid=0 → 关（开发构建下也能关掉网格）', () => {
    expect(resolveMapDebug({ DEV: true }, '?mapGrid=0')).toEqual({ showGrid: false });
    expect(resolveMapDebug({ DEV: false }, '?mapGrid=0')).toEqual({ showGrid: false });
  });

  it('search 带不带前导 ? 都接受；与其他参数混排也能取到', () => {
    expect(resolveMapDebug({ DEV: false }, 'mapGrid=1').showGrid).toBe(true);
    expect(resolveMapDebug({ DEV: false }, '?a=1&mapGrid=1&b=2').showGrid).toBe(true);
    expect(resolveMapDebug({ DEV: true }, '?a=1&mapGrid=0&b=2').showGrid).toBe(false);
  });

  it('参数名与常量一致（避免文档/代码两处写法漂移）', () => {
    expect(MAP_GRID_PARAM).toBe('mapGrid');
    expect(resolveMapDebug({ DEV: false }, `?${MAP_GRID_PARAM}=1`).showGrid).toBe(true);
  });
});

describe('resolveMapDebug · 回退到构建模式', () => {
  it('无参数 + DEV=true → 开', () => {
    expect(resolveMapDebug({ DEV: true }, '')).toEqual({ showGrid: true });
    expect(resolveMapDebug({ DEV: true }, '?')).toEqual({ showGrid: true });
    expect(resolveMapDebug({ DEV: true }, '?other=1')).toEqual({ showGrid: true });
  });

  it('无参数 + DEV=false → 关', () => {
    expect(resolveMapDebug({ DEV: false }, '')).toEqual({ showGrid: false });
    expect(resolveMapDebug({ DEV: false }, '?other=1')).toEqual({ showGrid: false });
  });

  it('DEV 缺省 / undefined（正式构建里 import.meta.env.DEV 可能不存在）→ 关', () => {
    expect(resolveMapDebug({}, '').showGrid).toBe(false);
    expect(resolveMapDebug({ DEV: undefined }, '').showGrid).toBe(false);
  });

  it('非法值（x / true / 空串 / 2 / 1.0）一律回退到构建模式', () => {
    for (const value of ['x', 'true', '', '2', '1.0', 'yes', 'TRUE']) {
      expect(resolveMapDebug({ DEV: true }, `?mapGrid=${value}`)).toEqual({ showGrid: true });
      expect(resolveMapDebug({ DEV: false }, `?mapGrid=${value}`)).toEqual({ showGrid: false });
    }
  });

  it('重复参数取第一个（与 URLSearchParams 口径一致）', () => {
    expect(resolveMapDebug({ DEV: false }, '?mapGrid=1&mapGrid=0').showGrid).toBe(true);
    expect(resolveMapDebug({ DEV: true }, '?mapGrid=0&mapGrid=1').showGrid).toBe(false);
  });

  it('畸形 / 非字符串 search 不抛错', () => {
    expect(resolveMapDebug({ DEV: true }, '???').showGrid).toBe(true);
    expect(resolveMapDebug({ DEV: true }, '#mapGrid=1').showGrid).toBe(true);
    expect(resolveMapDebug({ DEV: false }, undefined as unknown as string).showGrid).toBe(false);
    expect(resolveMapDebug({ DEV: true }, null as unknown as string).showGrid).toBe(true);
  });
});
