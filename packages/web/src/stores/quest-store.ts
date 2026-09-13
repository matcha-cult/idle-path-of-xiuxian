/**
 * QuestStore —— 任务 / 章节 + 一次性补发同步（07 §2.10）。
 *
 * `detail` / `chapterDetail` 返回详情数据供弹窗即时消费（不留字段避免 UI 状态互相覆盖）；
 * `sync` / `chapterSync` 都把结果写入 `lastSync`（两者 data 形状一致）。
 */
import { makeAutoObservable, runInAction } from 'mobx';
import type {
  ChapterDetail,
  ChapterView,
  QuestDetail,
  QuestSyncData,
  QuestView,
} from '@idle-path/ionet-transport';
import type { StoreContext } from './store-context.js';

export class QuestStore {
  /** 任务列表。 */
  quests: QuestView[] = [];
  /** 任务总数。 */
  total = 0;
  /** 已完成任务数。 */
  completed = 0;
  /** 章节列表。 */
  chapters: ChapterView[] = [];
  /** 当前章节序号（无当前章节为 null）。 */
  currentChapter: number | null = null;
  /** 最近一次任务/章节奖励补发结果。 */
  lastSync: QuestSyncData | null = null;
  loading = false;
  error: string | null = null;

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx'>(this, { ctx: false }, { autoBind: true });
  }

  /** 同时拉取任务列表 + 章节列表。 */
  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const [questResult, chapterResult] = await Promise.all([
        this.ctx.game.quest.list(),
        this.ctx.game.quest.chapterList(),
      ]);
      const questData = questResult.data;
      const chapterData = chapterResult.data;
      if (questData === undefined) throw new Error('任务列表响应缺少 data');
      runInAction(() => {
        this.quests = questData.quests;
        this.total = questData.total;
        this.completed = questData.completed;
        if (chapterData !== undefined) {
          this.chapters = chapterData.chapters;
          this.currentChapter = chapterData.currentChapter;
        }
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '任务加载失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 任务详情（失败码：QUEST_NOT_FOUND）。 */
  async detail(code: string): Promise<QuestDetail | null> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.quest.detail(code);
      const data = result.data;
      if (data === undefined) throw new Error('任务详情响应缺少 data');
      return data.quest;
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '任务详情加载失败');
      return null;
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 任务奖励补发同步（幂等）。 */
  async sync(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.quest.sync();
      const data = result.data;
      if (data === undefined) throw new Error('任务同步响应缺少 data');
      runInAction(() => {
        this.lastSync = data;
      });
      if (data.granted.length > 0) {
        this.ctx.toast.success('任务奖励已补发', `${data.granted.length} 项`);
      } else {
        this.ctx.toast.info('没有待补发的任务奖励');
      }
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '任务同步失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 章节详情（失败码：CHAPTER_NOT_FOUND）。 */
  async chapterDetail(chapter: string): Promise<ChapterDetail | null> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.quest.chapterDetail(chapter);
      const data = result.data;
      if (data === undefined) throw new Error('章节详情响应缺少 data');
      return data.chapter;
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '章节详情加载失败');
      return null;
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 章节奖励补发同步（data 形状与任务同步一致）。 */
  async chapterSync(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.quest.chapterSync();
      const data = result.data;
      if (data === undefined) throw new Error('章节同步响应缺少 data');
      runInAction(() => {
        this.lastSync = data;
      });
      if (data.granted.length > 0) {
        this.ctx.toast.success('章节奖励已补发', `${data.granted.length} 项`);
      } else {
        this.ctx.toast.info('没有待补发的章节奖励');
      }
      await this.load();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '章节同步失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
