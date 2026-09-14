/**
 * IdleStore —— 离线挂机状态与结算（07 §2.12；§23 A3/B2 修订）。
 *
 * `idle.settle` 走 `allowBusinessFailure`（业务失败是预期分支），成功分两支：
 * 正常结算与「无可结算」（全零体），后者不是错误。
 * **判别式是 `kills === 0`**（§23 A3 起整轮挂机没有单一单位，不再用 `unit === null`）。
 *
 * §23 B2：上线 / 建角 / 进挂机面板会**自动结算一次**（`autoSettle`）。它必须:
 * - **幂等**：一次会话只自动尝试一次；`settle` 成功会刷新 `last_settle_at`，重复调用天然
 *   退化为「暂无可结算收益」，不需要额外幂等键；
 * - **静默**：战斗中（`ONLINE_BATTLE_ACTIVE`）与「无可结算」都不弹提示、不写 `error`
 *   —— 否则每次上线都弹一条红色/灰色提示。静默模式同时**不动 `loading`**，避免把挂机
 *   面板闪成骨架屏；
 * - **可补做**：被战斗挡下（以及尚未建角）时保留待办，下次触发点（离开战斗后进面板）再试。
 */
import { makeAutoObservable, observable, runInAction } from 'mobx';
import { businessCodeOf, businessErrorMessage, businessMessageOf } from '@idle-path/ionet-transport';
import type { IdleSettleInput, IdleSettleResultData, IdleStatusData } from '@idle-path/ionet-transport';
import { LoadGuard } from './load-guard.js';
import type { StoreContext } from './store-context.js';

/** `settle` 的结果分类（B2 的自动结算据此决定要不要留着下次再试）。 */
export type IdleSettleOutcome =
  /** 真结算出了收益 */
  | 'settled'
  /** 成功但「暂无可结算收益」（正常分支） */
  | 'empty'
  /** 被状态闸门挡下：在线战斗中 / 尚未建角 —— 可以稍后重试 */
  | 'blocked'
  /** 其他业务失败或网络异常 —— 本次会话不再重试 */
  | 'failed';

/**
 * 允许在下次触发点重试的业务码。
 *
 * - `ONLINE_BATTLE_ACTIVE`（§22 Q6 互斥闸门）：人离开秘境后就该恢复，必须补做；
 * - `CHARACTER_NOT_FOUND`：`loadPanel()` 与 `createCharacter` 之间隔着一次建角，
 *   首次自动结算必然撞上它 —— 若按「失败」收摊，建角后就再也不会自动结算了。
 */
const RETRYABLE_SETTLE_CODES = new Set(['ONLINE_BATTLE_ACTIVE', 'CHARACTER_NOT_FOUND']);

export class IdleStore {
  /** 挂机状态（待结算时长 / 预估收益 / 今日产出上限）。 */
  status: IdleStatusData | null = null;
  /** 最近一次结算结果。 */
  lastSettle: IdleSettleResultData | null = null;
  loading = false;
  error: string | null = null;

  /** 竞态守卫：仅最后一次发起的加载允许回写状态（规划 09 §6.2 B5）。 */
  private readonly guard = new LoadGuard();
  /** B2：自动结算是否已有结论（成功 / 空 / 失败都算结论；被闸门挡下不算）。 */
  private autoSettleDone = false;
  /** B2：自动结算是否在途（挂机面板挂载与 `loadPanel()` 可能几乎同时触发）。 */
  private autoSettleInFlight = false;

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx' | 'guard' | 'autoSettleDone' | 'autoSettleInFlight'>(
      this,
      { ctx: false, guard: false, autoSettleDone: false, autoSettleInFlight: false },
      { autoBind: true },
    );
  }

  /**
   * 拉取挂机状态（无业务码）。
   *
   * `quiet` 供自动结算复用：不翻转 `loading`，避免后台结算把面板闪成骨架屏。
   */
  async load(options: { quiet?: boolean } = {}): Promise<void> {
    const quiet = options.quiet === true;
    const token = this.guard.next();
    if (!quiet) this.loading = true;
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
      if (quiet) return;
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '挂机状态加载失败');
    } finally {
      if (!quiet && this.guard.isCurrent(token)) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }

  /**
   * 结算离线挂机收益；无参数时按 `{}`（服务端按真实离线时长结算）。
   *
   * `silent`（§23 B2 自动结算专用）：不弹任何提示、不写 `error`、不动 `loading`，
   * 只把结果写进 `lastSettle` 并刷新状态。
   */
  async settle(input?: IdleSettleInput, options: { silent?: boolean } = {}): Promise<IdleSettleOutcome> {
    const silent = options.silent === true;
    if (!silent) {
      this.loading = true;
      this.error = null;
    }
    try {
      const result = await this.ctx.game.idle.settle(input ?? {});
      if (result.success === false) {
        const code = businessCodeOf(result) ?? '';
        const message = businessMessageOf(result) ?? businessErrorMessage(code);
        if (!silent) {
          runInAction(() => {
            this.error = message;
          });
          this.ctx.toast.fromBusinessCode(code, message);
        }
        return RETRYABLE_SETTLE_CODES.has(code) ? 'blocked' : 'failed';
      }
      const data = result.data;
      if (data === undefined) throw new Error('挂机结算响应缺少 data');
      runInAction(() => {
        this.lastSettle = data;
      });
      if (!silent) {
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
      }
      await this.load({ quiet: silent });
      return data.kills <= 0 ? 'empty' : 'settled';
    } catch (error) {
      if (!silent) {
        runInAction(() => {
          this.error = error instanceof Error ? error.message : String(error);
        });
        this.ctx.toast.fromError(error, '挂机结算失败');
      }
      return 'failed';
    } finally {
      if (!silent) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }

  /**
   * §23 B2：**上线 / 建角 / 进挂机面板**时自动结算一次（静默）。
   *
   * 触发点由容器给（`RootStore.loadPanel()` 与 `IdlePanel` 挂载），本方法自己保证：
   * - 已有结论（成功 / 空 / 失败）→ 直接返回，**不在每次刷新时重复调用**；
   * - 在途 → 直接返回（两个触发点几乎同时发生时只发一次请求）；
   * - 被闸门挡下（战斗中 / 未建角）→ 不落结论，等下一个触发点补做。
   */
  async autoSettle(): Promise<void> {
    if (this.autoSettleDone || this.autoSettleInFlight) return;
    this.autoSettleInFlight = true;
    try {
      const outcome = await this.settle(undefined, { silent: true });
      if (outcome !== 'blocked') this.autoSettleDone = true;
    } finally {
      this.autoSettleInFlight = false;
    }
  }
}
