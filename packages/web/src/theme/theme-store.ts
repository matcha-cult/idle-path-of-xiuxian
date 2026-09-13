/**
 * ThemeStore —— 主题态持久化（只有 light/dark 两态，见规划 09 §2.1 D3）。
 *
 * 纪律（对齐规划 09 §6.2 的 MobX 反模式防线）：
 * - **构造函数零副作用**：只保存依赖，不读也不写存储；恢复走显式 `hydrate()`；
 * - 状态写入一律 `runInAction`；存储写入失败不影响内存态（隐私模式不致命）。
 */
import { makeAutoObservable, runInAction } from 'mobx';
import { nextThemeMode, type ThemeMode } from '@idle-path/ui-kit';
import type { StorageLike } from '../services/storage.js';

/** 主题持久化键（与 `index.html` 的防闪烁内联脚本共用，改动需同步）。 */
export const THEME_STORAGE_KEY = 'idle-path.theme';

/** 解析持久化值：非法/缺失/多余取值一律回退亮色（不做 OS 偏好推断）。 */
export function parseThemeMode(raw: string | null | undefined): ThemeMode {
  return raw === 'dark' ? 'dark' : 'light';
}

export class ThemeStore {
  /** 当前主题态；默认亮色（hydrate 前）。 */
  mode: ThemeMode = 'light';

  constructor(private readonly storage: StorageLike) {
    makeAutoObservable<this, 'storage'>(this, { storage: false }, { autoBind: true });
  }

  get isDark(): boolean {
    return this.mode === 'dark';
  }

  /** 从存储恢复并返回结果（显式调用，避免构造函数副作用）。 */
  hydrate(): ThemeMode {
    const mode = parseThemeMode(this.safeRead());
    runInAction(() => {
      this.mode = mode;
    });
    return mode;
  }

  /** 设置主题态（同值幂等，但仍会补写存储）。 */
  setMode(mode: ThemeMode): void {
    if (this.mode !== mode) {
      runInAction(() => {
        this.mode = mode;
      });
    }
    this.persist(mode);
  }

  /** 一键切换：亮 ↔ 暗。 */
  toggle(): void {
    this.setMode(nextThemeMode(this.mode));
  }

  private safeRead(): string | null {
    try {
      return this.storage.getItem(THEME_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private persist(mode: ThemeMode): void {
    try {
      this.storage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      /* 存储不可用（隐私模式/配额）不致命：内存态仍然正确 */
    }
  }
}
