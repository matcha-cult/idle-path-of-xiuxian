/**
 * SessionStore —— JWT / 用户 / 角色基础信息（02 §3.5、§4.1）。
 *
 * 职责边界：
 * - REST 通道只做「注册 / 登录 / 角色查询与创建」（后端职责划分，06 §1 S2）；
 * - token 落 `localStorage`（浏览器）；`?token=` 由 transport 层在握手时拼接；
 * - 角色信息（Character）来自 REST，游戏面板数据来自 WS（各域 Store）。
 */
import { makeAutoObservable, runInAction } from 'mobx';
import { RestApi, RestError } from '@idle-path/ionet-transport';
import type { AuthUser, Character } from '@idle-path/ionet-transport';
import type { ToastStore } from './toast-store.js';

/**
 * 存储抽象复用 `services/storage.ts` 的唯一定义（此处再导出仅为兼容既有 import 路径）。
 */
import type { StorageLike } from '../services/storage.js';

export type { StorageLike };

export const TOKEN_STORAGE_KEY = 'idle-path.token';
export const USER_STORAGE_KEY = 'idle-path.user';

export type SessionStatus = 'anonymous' | 'authenticating' | 'authenticated' | 'error';

export class SessionStore {
  token: string | null = null;
  user: AuthUser | null = null;
  character: Character | null = null;
  hasCharacter = false;
  status: SessionStatus = 'anonymous';
  busy = false;
  errorMessage: string | null = null;

  constructor(
    private readonly rest: RestApi,
    private readonly storage: StorageLike,
    private readonly toast: ToastStore,
  ) {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isAuthenticated(): boolean {
    return this.token !== null;
  }

  /** 从本地存储恢复登录态（不校验 token 有效性——由 HTTP 401 / WS 401 兜底）。 */
  restore(): boolean {
    const token = this.storage.getItem(TOKEN_STORAGE_KEY);
    const rawUser = this.storage.getItem(USER_STORAGE_KEY);
    let user: AuthUser | null = null;
    if (rawUser !== null) {
      try {
        user = JSON.parse(rawUser) as AuthUser;
      } catch {
        user = null;
      }
    }
    runInAction(() => {
      this.token = token !== null && token !== '' ? token : null;
      this.user = user;
      this.status = this.token !== null ? 'authenticated' : 'anonymous';
    });
    return this.token !== null;
  }

  async login(username: string, password: string): Promise<boolean> {
    return this.authenticate(() => this.rest.auth.login(username, password));
  }

  async register(username: string, password: string): Promise<boolean> {
    return this.authenticate(() => this.rest.auth.register(username, password));
  }

  private async authenticate(
    action: () => Promise<{ success: boolean; message?: string; data?: { token: string; user: AuthUser } }>,
  ): Promise<boolean> {
    runInAction(() => {
      this.busy = true;
      this.status = 'authenticating';
      this.errorMessage = null;
    });
    try {
      const result = await action();
      const data = result.data;
      if (data === undefined) throw new Error('登录响应缺少 data');
      runInAction(() => {
        this.token = data.token;
        this.user = data.user;
        this.status = 'authenticated';
        this.errorMessage = null;
      });
      this.storage.setItem(TOKEN_STORAGE_KEY, data.token);
      this.storage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      return true;
    } catch (error) {
      runInAction(() => {
        this.status = 'error';
        this.errorMessage = error instanceof Error ? error.message : String(error);
      });
      this.toast.fromError(error, '登录失败');
      return false;
    } finally {
      runInAction(() => {
        this.busy = false;
      });
    }
  }

  logout(): void {
    runInAction(() => {
      this.token = null;
      this.user = null;
      this.character = null;
      this.hasCharacter = false;
      this.status = 'anonymous';
      this.errorMessage = null;
    });
    this.storage.removeItem(TOKEN_STORAGE_KEY);
    this.storage.removeItem(USER_STORAGE_KEY);
  }

  /** 401 兜底：token 失效时由任意 REST 调用触发。 */
  handleUnauthorized(): void {
    if (this.token === null) return;
    this.logout();
    this.toast.error('登录状态已失效', '请重新登录');
  }

  /** 拉取角色基础信息（REST）。 */
  async loadCharacter(): Promise<boolean> {
    if (this.token === null) return false;
    try {
      const result = await this.rest.character.check();
      const data = result.data;
      runInAction(() => {
        this.character = data?.character ?? null;
        this.hasCharacter = data?.hasCharacter ?? false;
      });
      return true;
    } catch (error) {
      if (error instanceof RestError && error.status === 401) this.handleUnauthorized();
      else this.toast.fromError(error, '获取角色失败');
      return false;
    }
  }

  async createCharacter(nickname: string, gender: 'male' | 'female'): Promise<boolean> {
    if (this.token === null) return false;
    runInAction(() => {
      this.busy = true;
    });
    try {
      const result = await this.rest.character.create(nickname, gender);
      runInAction(() => {
        this.character = result.data?.character ?? null;
        this.hasCharacter = result.data?.hasCharacter ?? true;
      });
      this.toast.success('角色创建成功');
      return true;
    } catch (error) {
      if (error instanceof RestError && error.status === 401) this.handleUnauthorized();
      else this.toast.fromError(error, '创建角色失败');
      return false;
    } finally {
      runInAction(() => {
        this.busy = false;
      });
    }
  }

  /** 刷新角色资源（灵韵/灵石等会被 WS Action 改动，供面板刷新时同步）。 */
  async refreshCharacter(): Promise<void> {
    if (this.token === null) return;
    try {
      const result = await this.rest.character.info();
      runInAction(() => {
        this.character = result.data?.character ?? null;
        this.hasCharacter = result.data?.hasCharacter ?? false;
      });
    } catch {
      /* 静默：面板刷新失败不打断主流程 */
    }
  }
}
