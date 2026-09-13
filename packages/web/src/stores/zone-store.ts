/**
 * ZoneStore —— 秘境列表 / 进度 / 进入 / 挑战（07 §2.9）。P3.0 起兼**在线历练实况**。
 *
 * 业务失败是**预期分支**：`zone.enter` / `zone.challenge` 都走 `allowBusinessFailure`，
 * 失败体不抛异常。`challenge` 按规格把失败体文案写进 `error` 并 toast，绝不向上抛。
 * `zone.progress` 在「尚未进入任何秘境」时返回 `ZONE_NOT_FOUND`（BusinessError），
 * 这是正常初始态，因此 load() 里单独吞掉，不影响 zones 列表展示。
 *
 * 在线历练（P3.0）：`online` 是**服务端权威帧**（`zone.online` 读一次 / `(100,5)` 推送覆盖）。
 * 客户端**不本地涨层、不本地算产出**（R2 §4.2 明确不做）—— 本 store 只做「存帧 + 显示」。
 */
import { makeAutoObservable, observable, runInAction } from 'mobx';
import {
  ZONE_CMD,
  businessCodeOf,
  businessErrorMessage,
  businessMessageOf,
} from '@idle-path/ionet-transport';
import type {
  ZoneChallengeData,
  ZoneOnlineData,
  ZoneOnlineEvent,
  ZoneProgressData,
  ZoneView,
} from '@idle-path/ionet-transport';
import { LoadGuard } from './load-guard.js';
import type { StoreContext } from './store-context.js';

/** 推送帧的最小结构面（root-store 的 PushFrame 同形）。 */
interface OnlinePushFrame {
  subCmd?: number;
  data?: unknown;
}

/** 事件 → 提示文案（`stuck` 由面板常驻显示，这里只提一次原因）。 */
const EVENT_TOASTS: Record<ZoneOnlineEvent, string> = {
  floor_up: '历练涨层',
  boss_floor: '进入 Boss 层',
  boss_defeated: '击败 Boss',
  idle_unlocked: '已解锁离线挂机',
  stuck: '战力不足，已原地刷本层',
};

export class ZoneStore {
  /** 秘境列表（含解锁状态与进度）。 */
  zones: ZoneView[] = [];
  /** 玩家战力（服务端计算）。 */
  playerPower = 0;
  /** 当前所在秘境 code（未进入为 null）。 */
  currentZone: string | null = null;
  /** 当前秘境进度（无当前秘境为 null）。 */
  progress: ZoneProgressData | null = null;
  /** 最近一次挑战结果。 */
  lastChallenge: ZoneChallengeData | null = null;
  /** 在线历练实况（P3.0；null = 还没读到）。 */
  online: ZoneOnlineData | null = null;
  loading = false;
  error: string | null = null;

  /** 竞态守卫：仅最后一次发起的加载允许回写状态（规划 09 §6.2 B5）。 */
  private readonly guard = new LoadGuard();

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx' | 'guard'>(this, { ctx: false, guard: false, zones: observable.shallow }, { autoBind: true });
  }

  /** 同时拉取秘境列表 + 当前进度 + 在线历练实况。 */
  async load(): Promise<void> {
    const token = this.guard.next();
    this.loading = true;
    this.error = null;
    try {
      const [zonesResult, progressResult, onlineResult] = await Promise.all([
        this.ctx.game.zone.zones(),
        // 无当前秘境时 progress 抛 ZONE_NOT_FOUND；按初始态处理，不阻断列表。
        this.ctx.game.zone.progress().catch(() => null),
        // 实况是增强信息：失败（老服务端 / 未鉴权）静默返回 null，不阻断列表与进度。
        this.ctx.game.zone.online().catch(() => null),
      ]);
      const zonesData = zonesResult.data;
      if (zonesData === undefined) throw new Error('秘境列表响应缺少 data');
      if (!this.guard.isCurrent(token)) return;
      const progressData = progressResult === null ? undefined : progressResult.data;
      const onlineData = onlineResult === null ? undefined : onlineResult.data;
      runInAction(() => {
        this.zones = zonesData.zones;
        this.playerPower = zonesData.playerPower;
        this.currentZone = zonesData.currentZone;
        this.progress = progressData ?? null;
        if (onlineData !== undefined) this.online = onlineData;
      });
    } catch (error) {
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '秘境加载失败');
    } finally {
      if (this.guard.isCurrent(token)) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }

  /**
   * 单独刷新在线历练实况（面板的「刷新实况」按钮）。
   *
   * 不碰 `loading`（避免把整面板换成骨架屏），失败静默 —— 实况不是权威动作，
   * 真正的推进永远发生在服务端 tick。
   */
  async loadOnline(): Promise<void> {
    try {
      const result = await this.ctx.game.zone.online();
      const data = result.data;
      if (data === undefined) return;
      runInAction(() => {
        this.online = data;
      });
    } catch {
      /* 实况读取失败不影响面板其余内容 */
    }
  }

  /**
   * 页面可见性上报（P3.0 T2）：`visibilitychange` 时由容器调用。
   *
   * ‼️ 只上报「可见 / 不可见」，**不上报任何时长**（R2 §4.2：时长可伪造）。
   * fire-and-forget：这不是业务动作，失败静默。
   */
  reportVisibility(visible: boolean): void {
    void this.ctx.game.zone
      .visibility(visible)
      .then(() => undefined)
      .catch(() => undefined);
  }

  /**
   * 服务端推送 `(100,5)` → 覆盖实况帧 + 对关键事件给一次性提示。
   *
   * 帧是**服务端算完的结果**，这里只存不算（客户端不本地涨层、不本地算产出）。
   */
  handleNotification(frame: OnlinePushFrame): void {
    if (frame.subCmd !== ZONE_CMD.online) return;
    const data = frame.data as ZoneOnlineData | undefined;
    if (data === undefined || data === null || typeof data !== 'object') return;
    runInAction(() => {
      this.online = data;
    });
    for (const event of data.events) {
      const text = EVENT_TOASTS[event];
      if (text === undefined) continue;
      this.ctx.toast.success(text, data.zone?.name ?? '历练峰');
    }
  }

  /** 进入秘境（业务失败是预期分支：REALM_TOO_LOW / ZONE_LOCKED 等）。 */
  async enter(zoneCode: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.zone.enter(zoneCode);
      if (result.success === false) {
        const message = businessMessageOf(result) ?? businessErrorMessage(businessCodeOf(result));
        runInAction(() => {
          this.error = message;
        });
        this.ctx.toast.fromBusinessCode(businessCodeOf(result), message);
        return;
      }
      const data = result.data;
      if (data === undefined) throw new Error('进入秘境响应缺少 data');
      runInAction(() => {
        this.currentZone = data.currentZone.code;
      });
      this.ctx.toast.success('已进入秘境', `${data.currentZone.name} · 第 ${data.floor} 层`);
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '进入秘境失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 挑战当前/指定秘境一层（业务失败是预期分支，只记录不抛）。 */
  async challenge(zoneCode?: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.zone.challenge(zoneCode);
      if (result.success === false) {
        const code = businessCodeOf(result);
        const message = businessMessageOf(result) ?? businessErrorMessage(code);
        runInAction(() => {
          this.error = message;
        });
        this.ctx.toast.fromBusinessCode(code, message);
        return;
      }
      const data = result.data;
      if (data === undefined) throw new Error('挑战响应缺少 data');
      runInAction(() => {
        this.lastChallenge = data;
      });
      this.ctx.toast.success(
        data.cleared ? '秘境已通关' : '挑战成功',
        `${data.zone.name} · 第 ${data.floor} 层 → 第 ${data.nextFloor} 层`,
      );
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '挑战失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
