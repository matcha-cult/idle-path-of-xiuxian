/**
 * `resolveMapDebug` 的边界：`1` / `0` / 无参数 / 非法值 / 重复参数 / 畸形串。
 *
 * 口径（`19-...任务书.md` §7）：**只有 `?mapGrid=1` 才开**；缺省与非法值一律关 ——
 * 网格是调坐标用的调试工具，平时开着满屏点阵很吵，而且它的轴标文字正是拖动时
 * 被浏览器原生选中的那串数字。`env.DEV` **不再参与判定**（开发服与正式服行为一致）。
 */
import { describe, expect, it } from 'vitest';
import { MAP_GRID_PARAM, resolveMapDebug } from './debug-flags.js';

describe('resolveMapDebug · 只有 1 才开', () => {
  it('?mapGrid=1 → 开（与 DEV 无关）', () => {
    expect(resolveMapDebug({ DEV: true }, '?mapGrid=1')).toEqual({ showGrid: true });
    expect(resolveMapDebug({ DEV: false }, '?mapGrid=1')).toEqual({ showGrid: true });
    expect(resolveMapDebug({}, '?mapGrid=1')).toEqual({ showGrid: true });
  });

  it('?mapGrid=0 → 关（显式关，等价于缺省）', () => {
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

describe('resolveMapDebug · 缺省关（不再跟随 DEV）', () => {
  it('无参数：DEV=true 也关（本轮用户反馈的核心改动）', () => {
    expect(resolveMapDebug({ DEV: true }, '')).toEqual({ showGrid: false });
    expect(resolveMapDebug({ DEV: true }, '?')).toEqual({ showGrid: false });
    expect(resolveMapDebug({ DEV: true }, '?other=1')).toEqual({ showGrid: false });
  });

  it('无参数 + DEV=false / DEV 缺省 → 关', () => {
    expect(resolveMapDebug({ DEV: false }, '')).toEqual({ showGrid: false });
    expect(resolveMapDebug({ DEV: undefined }, '').showGrid).toBe(false);
    expect(resolveMapDebug({}, '').showGrid).toBe(false);
  });

  it('非法值（x / true / 空串 / 2 / 1.0 / yes）一律关', () => {
    for (const value of ['x', 'true', '', '2', '1.0', 'yes', 'TRUE']) {
      expect(resolveMapDebug({ DEV: true }, `?mapGrid=${value}`)).toEqual({ showGrid: false });
      expect(resolveMapDebug({ DEV: false }, `?mapGrid=${value}`)).toEqual({ showGrid: false });
    }
  });

  it('重复参数取第一个（与 URLSearchParams 口径一致）', () => {
    expect(resolveMapDebug({ DEV: false }, '?mapGrid=1&mapGrid=0').showGrid).toBe(true);
    expect(resolveMapDebug({ DEV: true }, '?mapGrid=0&mapGrid=1').showGrid).toBe(false);
  });

  it('畸形 / 非字符串 search 不抛错，且一律关', () => {
    expect(resolveMapDebug({ DEV: true }, '???').showGrid).toBe(false);
    expect(resolveMapDebug({ DEV: true }, '#mapGrid=1').showGrid).toBe(false);
    expect(resolveMapDebug({ DEV: false }, undefined as unknown as string).showGrid).toBe(false);
    expect(resolveMapDebug({ DEV: true }, null as unknown as string).showGrid).toBe(false);
  });
});
