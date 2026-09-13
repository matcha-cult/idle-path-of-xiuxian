/**
 * RealmStore —— 境界状态与突破（07 §2.7）。
 *
 * 突破成功后境界/灵韵两个来源都会变：WS 的 status 与 REST 的角色资源，
 * 因此并发刷新二者（`load()` + `session.refreshCharacter()`）。
 */
import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { RealmStatusData } from '@idle-path/ionet-transport';
import { LoadGuard } from './load-guard.js';
import type { StoreContext } from './store-context.js';

export class RealmStore {
  /** 突破信息（当前境界 / 灵韵 / 下一境消耗）。 */
  status: RealmStatusData | null = null;
  loading = false;
  error: string | null = null;

  /** 竞态守卫：仅最后一次发起的加载允许回写状态（规划 09 §6.2 B5）。 */
  private readonly guard = new LoadGuard();

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx' | 'guard'>(this, { ctx: false, guard: false }, { autoBind: true });
  }

  /** 拉取突破信息（无业务码）。 */
  async load(): Promise<void> {
    const token = this.guard.next();
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.realm.breakthroughInfo();
      const data = result.data;
      if (data === undefined) throw new Error('境界信息响应缺少 data');
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.status = data;
      });
    } catch (error) {
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '境界信息加载失败');
    } finally {
      if (this.guard.isCurrent(token)) {
        runInAction(() => {
          this.loading = false;
        });
      }
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
