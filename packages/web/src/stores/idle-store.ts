/**
 * IdleStore —— 离线挂机状态与结算（07 §2.12）。
 *
 * `idle.settle` 走 `allowBusinessFailure`（业务失败是预期分支），成功分两支：
 * 正常结算（`unit` 非空）与「无可结算」（`unit === null`，全零体），后者不是错误。
 */
import { makeAutoObservable, runInAction } from 'mobx';
import { businessCodeOf, businessMessageOf } from '@idle-path/ionet-transport';
import type { IdleSettleInput, IdleSettleResultData, IdleStatusData } from '@idle-path/ionet-transport';
import type { StoreContext } from './store-context.js';

export class IdleStore {
  /** 挂机状态（待结算时长 / 预估收益 / 今日产出上限）。 */
  status: IdleStatusData | null = null;
  /** 最近一次结算结果。 */
  lastSettle: IdleSettleResultData | null = null;
  loading = false;
  error: string | null = null;

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx'>(this, { ctx: false }, { autoBind: true });
  }

  /** 拉取挂机状态（无业务码）。 */
  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.idle.status();
      const data = result.data;
      if (data === undefined) throw new Error('挂机状态响应缺少 data');
      runInAction(() => {
        this.status = data;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '挂机状态加载失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
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
      if (data.unit === null) {
        // 「无可结算」是正常分支，不是错误。
        this.ctx.toast.info('暂无可结算收益', `离线 ${data.offlineHours} 小时`);
      } else {
        this.ctx.toast.success(
          '挂机结算完成',
          `${data.kills} 杀 · 灵韵 +${data.lingyunGained} · 物品 ${data.itemsProduced}`,
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
