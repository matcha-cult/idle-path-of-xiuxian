/**
 * EconomyStore —— 通货 / 精华 / 炼器（07 §2.6）。
 *
 * `economy.craft` 走 `allowBusinessFailure`，且**成功也分两支**：
 * 「未摧毁」得到物品视图，「瓦尔摧毁」得到 `{ destroyed: true, itemId }`。
 * 两支都要落到 `lastCraft`，摧毁分支额外用 error 级 toast 提示。
 */
import { makeAutoObservable, runInAction } from 'mobx';
import { businessCodeOf, businessMessageOf } from '@idle-path/ionet-transport';
import type {
  CraftInput,
  CraftResultData,
  CurrencyGrantInput,
  CurrencyView,
  EssenceGrantInput,
  EssenceView,
} from '@idle-path/ionet-transport';
import type { StoreContext } from './store-context.js';

export class EconomyStore {
  /** 通货清单与持有量。 */
  currencies: CurrencyView[] = [];
  /** 精华清单与持有量。 */
  essences: EssenceView[] = [];
  /** 最近一次炼器结果（成功两支：未摧毁 / 瓦尔摧毁）。 */
  lastCraft: CraftResultData | null = null;
  loading = false;
  error: string | null = null;

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx'>(this, { ctx: false }, { autoBind: true });
  }

  /** 同时拉取通货 + 精华。 */
  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const [currencyResult, essenceResult] = await Promise.all([
        this.ctx.game.economy.currencies(),
        this.ctx.game.economy.essences(),
      ]);
      const currencyData = currencyResult.data;
      const essenceData = essenceResult.data;
      if (currencyData === undefined) throw new Error('通货响应缺少 data');
      runInAction(() => {
        this.currencies = currencyData.currencies;
        this.essences = essenceData?.essences ?? this.essences;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '经济面板加载失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 炼器（14 种 op；业务失败是预期分支，成功分未摧毁/摧毁两支）。 */
  async craft(input: CraftInput): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.economy.craft(input);
      if (result.success === false) {
        const message = businessMessageOf(result) ?? '炼器失败';
        runInAction(() => {
          this.error = message;
        });
        this.ctx.toast.fromBusinessCode(businessCodeOf(result), message);
        return;
      }
      const data = result.data;
      if (data === undefined) throw new Error('炼器响应缺少 data');
      runInAction(() => {
        this.lastCraft = data;
      });
      if ('destroyed' in data) {
        // 瓦尔摧毁分支：物品本体已消失，按错误级别提示以便用户注意。
        this.ctx.toast.error('炼器摧毁了物品', `物品 #${data.itemId} 已消失`);
      } else {
        this.ctx.toast.success('炼器完成', data.item.name);
      }
      // 炼器消耗通货/精华，刷新持有量。
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '炼器失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 注入通货（dev 接口）。 */
  async grantCurrency(input: CurrencyGrantInput): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.economy.currencyGrant(input);
      const data = result.data;
      if (data === undefined) throw new Error('注入通货响应缺少 data');
      this.ctx.toast.success('通货已注入', `${data.code} → ${data.amount}`);
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '注入通货失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 注入精华（dev 接口）。 */
  async grantEssence(input: EssenceGrantInput): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.economy.essenceGrant(input);
      const data = result.data;
      if (data === undefined) throw new Error('注入精华响应缺少 data');
      this.ctx.toast.success('精华已注入', `${data.code} → ${data.count}`);
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '注入精华失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
