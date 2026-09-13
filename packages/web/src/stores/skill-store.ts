/**
 * SkillStore —— 功法图鉴 / 面板 / 修习 / 参悟（07 §2.5）。
 *
 * `load()` 用 `Promise.all` 同时拉图鉴与面板（两者都是无业务码的读接口）；
 * 写操作成功后重新拉取，保证面板与图鉴的 learned/level 与后端一致。
 */
import { makeAutoObservable, observable, runInAction } from 'mobx';
import type {
  PanelView,
  SkillCatalogView,
  SkillPanelUpdateInput,
} from '@idle-path/ionet-transport';
import { LoadGuard } from './load-guard.js';
import type { StoreContext } from './store-context.js';

export class SkillStore {
  /** 功法图鉴（含未修习项）。 */
  catalog: SkillCatalogView[] = [];
  /** 当前功法面板（未加载为 null）。 */
  panel: PanelView | null = null;
  loading = false;
  error: string | null = null;

  /** 竞态守卫：仅最后一次发起的加载允许回写状态（规划 09 §6.2 B5）。 */
  private readonly guard = new LoadGuard();

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx' | 'guard'>(this, { ctx: false, guard: false, catalog: observable.shallow }, { autoBind: true });
  }

  /** 同时拉取图鉴 + 面板。 */
  async load(): Promise<void> {
    const token = this.guard.next();
    this.loading = true;
    this.error = null;
    try {
      const [catalogResult, panelResult] = await Promise.all([
        this.ctx.game.skill.list(),
        this.ctx.game.skill.panel(),
      ]);
      const catalogData = catalogResult.data;
      const panelData = panelResult.data;
      if (catalogData === undefined) throw new Error('功法图鉴响应缺少 data');
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.catalog = catalogData.skills;
        this.panel = panelData?.panel ?? this.panel;
      });
    } catch (error) {
      if (!this.guard.isCurrent(token)) return;
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '功法加载失败');
    } finally {
      if (this.guard.isCurrent(token)) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }

  /** 修习功法（消耗未开光玉简）。 */
  async learn(skillId: number): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.skill.learn(skillId);
      if (result.data === undefined) throw new Error('修习响应缺少 data');
      this.ctx.toast.success('修习成功', `剩余玉简：${result.data.jadeSlips}`);
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '修习失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 参悟提升功法等级（消耗灵韵）。 */
  async enlighten(skillId: number): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.skill.enlighten(skillId);
      const data = result.data;
      if (data === undefined) throw new Error('参悟响应缺少 data');
      this.ctx.toast.success('参悟成功', `等级 ${data.level}`);
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '参悟失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 覆盖式更新功法面板（服务端写后回读视图）。 */
  async updatePanel(input: SkillPanelUpdateInput): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.skill.panelUpdate(input);
      const data = result.data;
      if (data === undefined) throw new Error('面板更新响应缺少 data');
      runInAction(() => {
        this.panel = data.panel;
      });
      this.ctx.toast.success('功法面板已更新');
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '面板更新失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /**
   * 注入灵韵（dev 接口，UI「开发注入」使用）。
   * 规格未列出该方法，但 GamePanelPage 直接引用；语义等价于 `skill.lingyunGrant`。
   */
  async grantLingyun(amount: number): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.skill.lingyunGrant(amount);
      const data = result.data;
      if (data === undefined) throw new Error('注入灵韵响应缺少 data');
      this.ctx.toast.success('灵韵已注入', `当前 ${data.lingyun}`);
      await this.ctx.root().session.refreshCharacter();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '注入灵韵失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
