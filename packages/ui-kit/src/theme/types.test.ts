/**
 * 主题契约纯函数边界（无 DOM，最快反馈）。
 */
import { describe, expect, it } from 'vitest';
import {
  COMPACT_ALWAYS_ON,
  DEFAULT_PRIMARY_COLOR,
  THEME_TOGGLE_LABELS,
  nextThemeMode,
  themeToggleLabel,
  type ThemeMode,
} from './types.js';

describe('nextThemeMode', () => {
  it('亮 ↔ 暗 严格互转（只有两态）', () => {
    expect(nextThemeMode('light')).toBe('dark');
    expect(nextThemeMode('dark')).toBe('light');
  });

  it('两次切换回到原态（幂等轮换）', () => {
    const start: ThemeMode = 'light';
    expect(nextThemeMode(nextThemeMode(start))).toBe(start);
  });
});

describe('themeToggleLabel', () => {
  it('提示的是「点击后将切到哪一态」，而不是当前态', () => {
    expect(themeToggleLabel('light')).toBe(THEME_TOGGLE_LABELS.dark);
    expect(themeToggleLabel('dark')).toBe(THEME_TOGGLE_LABELS.light);
  });

  it('两个态都有非空文案且互不相同', () => {
    expect(themeToggleLabel('light').length).toBeGreaterThan(0);
    expect(themeToggleLabel('dark').length).toBeGreaterThan(0);
    expect(themeToggleLabel('light')).not.toBe(themeToggleLabel('dark'));
  });
});

describe('常量契约（D3 决策的可断言化）', () => {
  it('紧凑恒定开启，且不是可配置项（常量而非 boolean 参数）', () => {
    expect(COMPACT_ALWAYS_ON).toBe(true);
  });

  it('主题色是合法 hex（唯一常量处）', () => {
    expect(DEFAULT_PRIMARY_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
