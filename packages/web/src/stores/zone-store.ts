/**
 * ZoneStore —— 秘境列表 / 进度 / 进入 / 挑战（07 §2.9）。
 *
 * 业务失败是**预期分支**：`zone.enter` / `zone.challenge` 都走 `allowBusinessFailure`，
 * 失败体不抛异常。`challenge` 按规格把失败体文案写进 `error` 并 toast，绝不向上抛。
 * `zone.progress` 在「尚未进入任何秘境」时返回 `ZONE_NOT_FOUND`（BusinessError），
 * 这是正常初始态，因此 load() 里单独吞掉，不影响 zones 列表展示。
 */
import { makeAutoObservable, runInAction } from 'mobx';
import { businessCodeOf, businessErrorMessage, businessMessageOf } from '@idle-path/ionet-transport';
import type { ZoneChallengeData, ZoneProgressData, ZoneView } from '@idle-path/ionet-transport';
import type { StoreContext } from './store-context.js';

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
  loading = false;
  error: string | null = null;

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx'>(this, { ctx: false }, { autoBind: true });
  }

  /** 同时拉取秘境列表 + 当前进度。 */
  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const [zonesResult, progressResult] = await Promise.all([
        this.ctx.game.zone.zones(),
        // 无当前秘境时 progress 抛 ZONE_NOT_FOUND；按初始态处理，不阻断列表。
        this.ctx.game.zone.progress().catch(() => null),
      ]);
      const zonesData = zonesResult.data;
      if (zonesData === undefined) throw new Error('秘境列表响应缺少 data');
      const progressData = progressResult === null ? undefined : progressResult.data;
      runInAction(() => {
        this.zones = zonesData.zones;
        this.playerPower = zonesData.playerPower;
        this.currentZone = zonesData.currentZone;
        this.progress = progressData ?? null;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '秘境加载失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
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
