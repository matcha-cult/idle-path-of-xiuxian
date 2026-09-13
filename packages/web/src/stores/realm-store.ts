/**
 * RealmStore —— 境界状态与突破（07 §2.7）。
 *
 * 突破成功后境界/灵韵两个来源都会变：WS 的 status 与 REST 的角色资源，
 * 因此并发刷新二者（`load()` + `session.refreshCharacter()`）。
 */
import { makeAutoObservable, runInAction } from 'mobx';
import type { RealmStatusData } from '@idle-path/ionet-transport';
import type { StoreContext } from './store-context.js';

export class RealmStore {
  /** 突破信息（当前境界 / 灵韵 / 下一境消耗）。 */
  status: RealmStatusData | null = null;
  loading = false;
  error: string | null = null;

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx'>(this, { ctx: false }, { autoBind: true });
  }

  /** 拉取突破信息（无业务码）。 */
  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.realm.breakthroughInfo();
      const data = result.data;
      if (data === undefined) throw new Error('境界信息响应缺少 data');
      runInAction(() => {
        this.status = data;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '境界信息加载失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 突破到下一境（失败码：MAX_REALM_REACHED / REALM_CHANGED / LINGYUN_NOT_ENOUGH）。 */
  async breakthrough(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.realm.breakthrough();
      const data = result.data;
      if (data === undefined) throw new Error('突破响应缺少 data');
      this.ctx.toast.success('突破成功', `晋入${data.realmName}`);
      await Promise.all([this.load(), this.ctx.root().session.refreshCharacter()]);
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '突破失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
