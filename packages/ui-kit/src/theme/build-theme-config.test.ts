/**
 * antd 主题配置构造：两态映射正确 + **紧凑恒在**（D3 硬约束）+ 边界与稳定性。
 */
import { theme } from 'antd';
import { describe, expect, it } from 'vitest';
import { buildThemeConfig, hasCompactAlgorithm } from './build-theme-config.js';
import { DEFAULT_PRIMARY_COLOR } from './types.js';

function algorithmsOf(mode: 'light' | 'dark'): unknown[] {
  const config = buildThemeConfig({ mode });
  return Array.isArray(config.algorithm) ? config.algorithm : [config.algorithm];
}

describe('buildThemeConfig · 两态算法映射', () => {
  it('light → defaultAlgorithm（不含 darkAlgorithm）', () => {
    const algorithms = algorithmsOf('light');
    expect(algorithms).toContain(theme.defaultAlgorithm);
    expect(algorithms).not.toContain(theme.darkAlgorithm);
  });

  it('dark → darkAlgorithm（不含 defaultAlgorithm）', () => {
    const algorithms = algorithmsOf('dark');
    expect(algorithms).toContain(theme.darkAlgorithm);
    expect(algorithms).not.toContain(theme.defaultAlgorithm);
  });
});

describe('buildThemeConfig · 紧凑恒在（不参数化）', () => {
  it.each(['light', 'dark'] as const)('%s 模式的 algorithm 必含 compactAlgorithm', (mode) => {
    expect(algorithmsOf(mode)).toContain(theme.compactAlgorithm);
    expect(hasCompactAlgorithm({ mode })).toBe(true);
  });

  it('紧凑顺序稳定：基色算法在前、紧凑派生在后', () => {
    expect(algorithmsOf('light')[0]).toBe(theme.defaultAlgorithm);
    expect(algorithmsOf('light')[1]).toBe(theme.compactAlgorithm);
    expect(algorithmsOf('dark')[0]).toBe(theme.darkAlgorithm);
    expect(algorithmsOf('dark')[1]).toBe(theme.compactAlgorithm);
  });

  it('接口上没有「关闭紧凑」的入口（传入额外字段也不影响）', () => {
    const config = buildThemeConfig({ mode: 'light' } as never);
    const algorithms = Array.isArray(config.algorithm) ? config.algorithm : [config.algorithm];
    expect(algorithms).toContain(theme.compactAlgorithm);
  });
});

describe('buildThemeConfig · token 与边界', () => {
  it('缺省主题色 = DEFAULT_PRIMARY_COLOR，圆角固定 6', () => {
    const config = buildThemeConfig({ mode: 'light' });
    expect(config.token?.colorPrimary).toBe(DEFAULT_PRIMARY_COLOR);
    expect(config.token?.borderRadius).toBe(6);
  });

  it('显式主题色被采纳', () => {
    expect(buildThemeConfig({ mode: 'dark', primaryColor: '#123456' }).token?.colorPrimary).toBe('#123456');
  });

  it('边界：空串 / 纯空白 / 非字符串 → 回退默认主题色', () => {
    expect(buildThemeConfig({ mode: 'light', primaryColor: '' }).token?.colorPrimary).toBe(DEFAULT_PRIMARY_COLOR);
    expect(buildThemeConfig({ mode: 'light', primaryColor: '   ' }).token?.colorPrimary).toBe(DEFAULT_PRIMARY_COLOR);
    expect(buildThemeConfig({ mode: 'light', primaryColor: undefined }).token?.colorPrimary).toBe(DEFAULT_PRIMARY_COLOR);
  });

  it('稳定性：同输入两次调用深相等（避免内联字面量导致的整树重渲染）', () => {
    expect(buildThemeConfig({ mode: 'dark' })).toEqual(buildThemeConfig({ mode: 'dark' }));
  });
});
