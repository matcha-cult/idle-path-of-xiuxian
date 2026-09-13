/**
 * CombatStore —— 单位图鉴 / 掉落表 / 生成与击杀（07 §2.8）。
 *
 * `combat.spawn` / `combat.kill` 都是 dev 接口且走 `allowBusinessFailure`：
 * 业务失败是预期分支（失败体不抛异常），因此按 `result.success` 显式分流。
 */
import { makeAutoObservable, observable, runInAction } from 'mobx';
import { businessCodeOf, businessMessageOf } from '@idle-path/ionet-transport';
import type {
  DropTableView,
  KillUnitInput,
  SpawnUnitInput,
  UnitCatalogView,
} from '@idle-path/ionet-transport';
import { LoadGuard } from './load-guard.js';
import type { StoreContext } from './store-context.js';

export class CombatStore {
  /** 单位图鉴。 */
  units: UnitCatalogView[] = [];
  /** 单位总数。 */
  total = 0;
  /** 掉落表全量。 */
  dropTables: DropTableView[] = [];
  loading = false;
  error: string | null = null;

  /** 竞态守卫：仅最后一次发起的加载允许回写状态（规划 09 §6.2 B5）。 */
  private readonly guard = new LoadGuard();

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx' | 'guard'>(this, { ctx: false, guard: false, units: observable.shallow, dropTables: observable.shallow }, { autoBind: true });
  }

  /** 同时拉取单位图鉴 + 掉落表。 */
  async load(): Promise<void> {
    const token = this.guard.next();
    this.loading = true;
    this.error = null;
    try {
      const [unitsResult, dropTablesResult] = await Promise.all([
        this.ctx.game.combat.units(),
        this.ctx.game.combat.dropTables(),
      ]);
      const unitsData = unitsResult.data;
      const dropTablesData = dropTablesResult.data;
      if (unitsData === undefined) throw new Error('单位图鉴响应缺少 data');
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.units = unitsData.units;
        this.total = unitsData.total;
        this.dropTables = dropTablesData?.tables ?? this.dropTables;
      });
    } catch (error) {
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '战斗图鉴加载失败');
    } finally {
      if (this.guard.isCurrent(token)) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }

  /** 生成单位实例（dev；业务失败是预期分支）。 */
  async spawn(input: SpawnUnitInput): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.combat.spawn(input);
      if (result.success === false) {
        const message = businessMessageOf(result) ?? '生成单位失败';
        runInAction(() => {
          this.error = message;
        });
        this.ctx.toast.fromBusinessCode(businessCodeOf(result), message);
        return;
      }
      const unit = result.data?.unit ?? null;
      runInAction(() => {
        this.error = null;
      });
      this.ctx.toast.success('单位已生成', unit === null ? undefined : `${unit.name}（${unit.realmName}）`);
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '生成单位失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 击杀单位并结算（dev；业务失败是预期分支）。 */
  async kill(input: KillUnitInput): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.combat.kill(input);
      if (result.success === false) {
        const message = businessMessageOf(result) ?? '击杀失败';
        runInAction(() => {
          this.error = message;
        });
        this.ctx.toast.fromBusinessCode(businessCodeOf(result), message);
        return;
      }
      const data = result.data;
      if (data === undefined) throw new Error('击杀结算响应缺少 data');
      this.ctx.toast.success(
        '击杀结算完成',
        `${data.kills} 杀 · 灵韵 +${data.lingyunGained} · 物品 ${data.itemsProduced}`,
      );
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '击杀失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
