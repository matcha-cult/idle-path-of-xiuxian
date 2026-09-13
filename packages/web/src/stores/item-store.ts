/**
 * ItemStore —— 背包 / 物品详情 / 基底图鉴 / 拾取规则（07 §2.2）。
 *
 * 错误口径：所有 Action 失败（TransportError / BusinessError / RestError）都在本 Store
 * 内被 try/catch 吞掉，写入 `error` 供 UI 展示，并经 `toast.fromError` 统一转译；
 * `load()` 之外的写操作成功后主动刷新对应列表，保持 UI 与服务端一致。
 */
import { makeAutoObservable, observable, runInAction } from 'mobx';
import type {
  BaseView,
  ItemView,
  PickupRuleCreateInput,
  PickupRuleUpdateInput,
  PickupRuleView,
} from '@idle-path/ionet-transport';
import { LoadGuard } from './load-guard.js';
import type { StoreContext } from './store-context.js';

/** 图鉴基底一次拉取上限（服务端 pageSize 上限 100）。 */
const BASES_PAGE_SIZE = 100;

export class ItemStore {
  /** 当前页物品（服务端已 clamp 分页）。 */
  items: ItemView[] = [];
  /** 背包物品总数。 */
  total = 0;
  /** 当前页（1 起，服务端回填为准）。 */
  page = 1;
  /** 每页条数（服务端回填为准）。 */
  pageSize = 20;
  /** 最近一次查询的物品详情。 */
  detail: ItemView | null = null;
  /** 基底图鉴（item.bases 首页）。 */
  bases: BaseView[] = [];
  /** 拾取规则列表。 */
  pickupRules: PickupRuleView[] = [];
  loading = false;
  error: string | null = null;

  /** 竞态守卫：仅最后一次发起的加载允许回写状态（规划 09 §6.2 B5）。 */
  private readonly guard = new LoadGuard();

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx' | 'guard'>(this, { ctx: false, guard: false, items: observable.shallow, bases: observable.shallow, pickupRules: observable.shallow }, { autoBind: true });
  }

  /** 拉取背包当前页（首屏即 `page=1`）。 */
  async load(): Promise<void> {
    const token = this.guard.next();
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.item.inventory({ page: this.page, pageSize: this.pageSize });
      const data = result.data;
      if (data === undefined) throw new Error('背包响应缺少 data');
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.items = data.items;
        this.total = data.total;
        this.page = data.page;
        this.pageSize = data.pageSize;
      });
    } catch (error) {
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '背包加载失败');
    } finally {
      if (this.guard.isCurrent(token)) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }

  /** 翻页：非法页码直接忽略，合法则改页并重拉。 */
  setPage(page: number): void {
    if (!Number.isFinite(page) || page < 1) return;
    this.page = Math.floor(page);
    void this.load();
  }

  /** 拉取物品详情（失败码：ITEM_NOT_FOUND / ITEM_NOT_OWNED 等）。 */
  async loadDetail(id: number): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.item.inventoryDetail(id);
      const data = result.data;
      if (data === undefined) throw new Error('物品详情响应缺少 data');
      runInAction(() => {
        this.detail = data.item;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '物品详情加载失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 拉取基底图鉴（公开数据，无业务码）。 */
  async loadBases(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.item.bases({ page: 1, pageSize: BASES_PAGE_SIZE });
      const data = result.data;
      if (data === undefined) throw new Error('基底图鉴响应缺少 data');
      runInAction(() => {
        this.bases = data.bases;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '图鉴加载失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 拉取拾取规则列表。 */
  async loadPickupRules(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.item.pickupRuleList();
      const data = result.data;
      if (data === undefined) throw new Error('拾取规则响应缺少 data');
      runInAction(() => {
        this.pickupRules = data.rules;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '拾取规则加载失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 新建拾取规则（服务端会规范化各字段）。 */
  async createPickupRule(input: PickupRuleCreateInput): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.item.pickupRuleCreate(input);
      const data = result.data;
      if (data === undefined) throw new Error('新建拾取规则响应缺少 data');
      this.ctx.toast.success('拾取规则已创建', data.rule.name);
      await this.loadPickupRules();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '新建拾取规则失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 部分更新拾取规则（undefined 字段保持原值）。 */
  async updatePickupRule(input: PickupRuleUpdateInput): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.item.pickupRuleUpdate(input);
      const data = result.data;
      if (data === undefined) throw new Error('更新拾取规则响应缺少 data');
      this.ctx.toast.success('拾取规则已更新', data.rule.name);
      await this.loadPickupRules();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '更新拾取规则失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 删除拾取规则。 */
  async deletePickupRule(id: number): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.item.pickupRuleDelete({ id });
      const data = result.data;
      if (data === undefined) throw new Error('删除拾取规则响应缺少 data');
      this.ctx.toast.success('拾取规则已删除', `#${data.ruleId}`);
      await this.loadPickupRules();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '删除拾取规则失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
