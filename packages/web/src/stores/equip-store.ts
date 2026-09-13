/**
 * EquipStore —— 装备栏 / 装备 / 卸下（07 §2.4）。
 *
 * 装备与卸下会同时改动「装备栏」与「背包」两份服务端状态，因此成功后再并发刷新
 * 两者（`equipment` + `root().item.load()`），避免 UI 双写不一致。
 */
import { makeAutoObservable, runInAction } from 'mobx';
import type { EquippedSlotView } from '@idle-path/ionet-transport';
import type { StoreContext } from './store-context.js';

export class EquipStore {
  /** 槽位 → 已装备摘要（无记录为 null）。 */
  slots: Record<string, EquippedSlotView | null> = {};
  /** 已占用槽位数。 */
  equippedCount = 0;
  loading = false;
  error: string | null = null;

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx'>(this, { ctx: false }, { autoBind: true });
  }

  /** 拉取装备栏全量视图（无业务码）。 */
  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.equip.equipment();
      const data = result.data;
      if (data === undefined) throw new Error('装备栏响应缺少 data');
      runInAction(() => {
        this.slots = data.slots;
        this.equippedCount = data.equippedCount;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '装备栏加载失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 装备背包内物品（戒指自动落 ring1/ring2）。 */
  async equip(itemId: number): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.equip.equip(itemId);
      const data = result.data;
      if (data === undefined) throw new Error('装备响应缺少 data');
      this.ctx.toast.success('装备成功', `槽位：${data.slot}`);
      await this.refreshAfterChange();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '装备失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 卸下已装备物品。 */
  async unequip(itemId: number): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.equip.unequip(itemId);
      const data = result.data;
      if (data === undefined) throw new Error('卸下响应缺少 data');
      this.ctx.toast.success('已卸下', `槽位：${data.slot}`);
      await this.refreshAfterChange();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '卸下失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 装备/卸下成功后并发刷新装备栏与背包（各自吞异常，不互相阻断）。 */
  private async refreshAfterChange(): Promise<void> {
    await Promise.all([this.load(), this.ctx.root().item.load()]);
  }
}
