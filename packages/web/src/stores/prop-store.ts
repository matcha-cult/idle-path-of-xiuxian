/**
 * PropStore —— item 原语（丢弃 / 生成，07 §2.3）。
 *
 * `prop.generate` 走 `allowBusinessFailure`：业务失败是**预期分支**（失败体原样返回，
 * 不抛 BusinessError），因此这里显式判 `result.success === false` 并按业务码提示。
 */
import { makeAutoObservable, runInAction } from 'mobx';
import { businessCodeOf, businessMessageOf } from '@idle-path/ionet-transport';
import type { GenerateItemInput, ItemView } from '@idle-path/ionet-transport';
import type { StoreContext } from './store-context.js';

export class PropStore {
  /** 最近一次成功丢弃的物品 id。 */
  lastDiscardedId: number | null = null;
  /** 最近一次成功生成的物品（dev 接口）。 */
  lastGenerated: ItemView | null = null;
  loading = false;
  error: string | null = null;

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx'>(this, { ctx: false }, { autoBind: true });
  }

  /**
   * prop 段没有读接口（只有 discard / generate 两个写 Action），
   * 为满足 Store 层统一契约（UI/loadPanel 可无差别调用 load()）仅复位状态，
   * 真正的数据刷新由 `lastDiscardedId` / `lastGenerated` 与 item 域承担。
   */
  async load(): Promise<void> {
    this.loading = false;
    this.error = null;
  }

  /** 丢弃背包内物品（失败码：ITEM_NOT_FOUND / ITEM_NOT_OWNED / ITEM_NOT_IN_BAG）。 */
  async discard(itemId: number): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.prop.discard(itemId);
      const data = result.data;
      const discardedId = data?.itemId ?? itemId;
      runInAction(() => {
        this.lastDiscardedId = discardedId;
      });
      this.ctx.toast.success('物品已丢弃', `#${discardedId}`);
      // 背包内容变化：刷新列表，避免 UI 展示已丢弃物品。
      await this.ctx.root().item.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '丢弃失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 生成物品（dev 接口；业务失败是预期分支）。 */
  async generate(input: GenerateItemInput): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.prop.generate(input);
      if (result.success === false) {
        const message = businessMessageOf(result) ?? '生成失败';
        runInAction(() => {
          this.error = message;
        });
        this.ctx.toast.fromBusinessCode(businessCodeOf(result), message);
        return;
      }
      const item = result.data?.item ?? null;
      runInAction(() => {
        this.lastGenerated = item;
      });
      this.ctx.toast.success('物品已生成', item?.name);
      await this.ctx.root().item.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '生成失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
