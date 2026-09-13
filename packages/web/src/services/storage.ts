/**
 * 存储抽象（**全仓唯一实现**）。
 *
 * 为什么独立成文件：`SessionStore`（token）、`ThemeStore`（主题）与 `RootStore`（默认存储解析）
 * 都需要它；若各自再写一份 `StorageLike` 与内存实现，就出现同一契约的多份真相
 * （规划 09 §6.1 A5 的教训）。
 *
 * 边界：隐私模式下访问 `localStorage` 会抛异常；无 `localStorage` 的环境（SSR/测试）回退内存实现。
 */

/** 最小存储接口（浏览器 `localStorage` / 测试内存实现）。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 内存实现：无 `localStorage` 环境（SSR / 单测）的兜底。 */
export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** 解析出可用存储：显式传入优先 → `localStorage` → 内存实现。 */
export function resolveStorage(storage?: StorageLike): StorageLike {
  if (storage !== undefined) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* 隐私模式等：回退内存实现 */
  }
  return createMemoryStorage();
}
