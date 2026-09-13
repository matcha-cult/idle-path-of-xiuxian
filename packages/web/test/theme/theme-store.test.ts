/**
 * ThemeStore 边界：持久化恢复、非法值回退、幂等 setMode、一键切换、构造零副作用、存储异常不致命。
 */
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, type StorageLike } from '../../src/services/storage.js';
import { parseThemeMode, THEME_STORAGE_KEY, ThemeStore } from '../../src/theme/theme-store.js';

describe('parseThemeMode', () => {
  it.each([
    ['dark', 'dark'],
    ['light', 'light'],
    [null, 'light'],
    [undefined, 'light'],
    ['', 'light'],
    ['DARK', 'light'],
    ['system', 'light'],
    ['true', 'light'],
  ] as const)('%s → %s', (raw, expected) => {
    expect(parseThemeMode(raw)).toBe(expected);
  });
});

describe('ThemeStore', () => {
  it('构造函数零副作用：不读不写存储，默认亮色', () => {
    const storage = createMemoryStorage();
    const getItem = vi.spyOn(storage, 'getItem');
    const setItem = vi.spyOn(storage, 'setItem');

    const store = new ThemeStore(storage);

    expect(store.mode).toBe('light');
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('hydrate 从存储恢复（dark）并返回结果', () => {
    const storage = createMemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, 'dark');
    const store = new ThemeStore(storage);

    expect(store.hydrate()).toBe('dark');
    expect(store.mode).toBe('dark');
    expect(store.isDark).toBe(true);
  });

  it('hydrate 遇到非法值回退亮色', () => {
    const storage = createMemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, 'system');
    const store = new ThemeStore(storage);

    expect(store.hydrate()).toBe('light');
  });

  it('setMode 写入存储；同值幂等但仍补写存储', () => {
    const storage = createMemoryStorage();
    const store = new ThemeStore(storage);

    store.setMode('dark');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    storage.removeItem(THEME_STORAGE_KEY);
    store.setMode('dark'); // 同值
    expect(store.mode).toBe('dark');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('toggle 亮 ↔ 暗 轮换', () => {
    const store = new ThemeStore(createMemoryStorage());
    store.toggle();
    expect(store.mode).toBe('dark');
    store.toggle();
    expect(store.mode).toBe('light');
  });

  it('存储读取抛异常 → 回退亮色，不冒泡', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const store = new ThemeStore(broken);
    expect(() => store.hydrate()).not.toThrow();
    expect(store.mode).toBe('light');
  });

  it('存储写入抛异常 → 内存态仍然切换成功', () => {
    const broken: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => undefined,
    };
    const store = new ThemeStore(broken);
    expect(() => store.setMode('dark')).not.toThrow();
    expect(store.mode).toBe('dark');
  });
});
