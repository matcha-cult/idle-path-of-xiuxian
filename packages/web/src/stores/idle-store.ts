/**
 * IdleStore —— 离线挂机状态与结算（07 §2.12；§23 A3 修订）。
 *
 * `idle.settle` 走 `allowBusinessFailure`（业务失败是预期分支），成功分两支：
 * 正常结算与「无可结算」（全零体），后者不是错误。
 * **判别式是 `kills === 0`**（§23 A3 起整轮挂机没有单一单位，不再用 `unit === null`）。
 */
import { makeAutoObservable, observable, runInAction } from 'mobx';
import { businessCodeOf, businessMessageOf } from '@idle-path/ionet-transport';
import type { IdleSettleInput, IdleSettleResultData, IdleStatusData } from '@idle-path/ionet-transport';
import { LoadGuard } from './load-guard.js';
import type { StoreContext } from './store-context.js';

export class IdleStore {
  /** 挂机状态（待结算时长 / 预估收益 / 今日产出上限）。 */
  status: IdleStatusData | null = null;
  /** 最近一次结算结果。 */
  lastSettle: IdleSettleResultData | null = null;
  loading = false;
  error: string | null = null;

  /** 竞态守卫：仅最后一次发起的加载允许回写状态（规划 09 §6.2 B5）。 */
  private readonly guard = new LoadGuard();

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx' | 'guard'>(this, { ctx: false, guard: false }, { autoBind: true });
  }

  /** 拉取挂机状态（无业务码）。 */
  async load(): Promise<void> {
    const token = this.guard.next();
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.idle.status();
      const data = result.data;
      if (data === undefined) throw new Error('挂机状态响应缺少 data');
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.status = data;
      });
    } catch (error) {
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '挂机状态加载失败');
    } finally {
      if (this.guard.isCurrent(token)) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }

  /** 结算离线挂机收益；无参数时按 `{}`（服务端按真实离线时长结算）。 */
  async settle(input?: IdleSettleInput): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.idle.settle(input ?? {});
      if (result.success === false) {
        const message = businessMessageOf(result) ?? '挂机结算失败';
        runInAction(() => {
          this.error = message;
        });
        this.ctx.toast.fromBusinessCode(businessCodeOf(result), message);
        return;
      }
      const data = result.data;
      if (data === undefined) throw new Error('挂机结算响应缺少 data');
      runInAction(() => {
        this.lastSettle = data;
      });
      if (data.kills <= 0) {
        // 「无可结算」是正常分支，不是错误。
        this.ctx.toast.info('暂无可结算收益', `离线 ${data.offlineHours} 小时`);
      } else {
        // §23 A3：整轮挂机打多于一层的秘境时，把「几层」也说出来，别让人以为只打了一层。
        const scope = data.floors.length > 0 ? `${data.floors.length} 层 · ` : '';
        this.ctx.toast.success(
          '挂机结算完成',
          `${scope}${data.kills} 杀 · 灵韵 +${data.lingyunGained} · 物品 ${data.itemsProduced}`,
        );
      }
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '挂机结算失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
