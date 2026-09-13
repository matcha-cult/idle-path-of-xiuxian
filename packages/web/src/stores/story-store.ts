/**
 * StoryStore —— 剧情节点文本与已读标记（07 §2.11）。
 *
 * 章节节点与任务节点分别存放（`nodes` / `questNodes`），避免两个入口互相覆盖；
 * 标记已读成功后本地同步 `seen`，无需再拉一次全量。
 */
import { makeAutoObservable, runInAction } from 'mobx';
import type { StoryChapterData, StoryNode } from '@idle-path/ionet-transport';
import type { StoreContext } from './store-context.js';

export class StoryStore {
  /** 当前章节摘要（未加载为 null）。 */
  chapter: StoryChapterData['chapter'] | null = null;
  /** 当前章节的剧情节点。 */
  nodes: StoryNode[] = [];
  /** 当前任务的剧情节点。 */
  questNodes: StoryNode[] = [];
  loading = false;
  error: string | null = null;

  constructor(private readonly ctx: StoreContext) {
    makeAutoObservable<this, 'ctx'>(this, { ctx: false }, { autoBind: true });
  }

  /**
   * 统一契约用的 load()：story 段的读接口必须带 chapter/quest 参数，
   * 因此这里只在已加载过章节时按 code 重拉，未加载过则为空操作。
   */
  async load(): Promise<void> {
    const code = this.chapter?.code;
    if (code === undefined) {
      this.error = null;
      return;
    }
    await this.loadChapter(code);
  }

  /** 拉取章节剧情节点（`chapter` 支持序号或 code）。 */
  async loadChapter(chapter: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.story.chapter(chapter);
      const data = result.data;
      if (data === undefined) throw new Error('章节剧情响应缺少 data');
      runInAction(() => {
        this.chapter = data.chapter;
        this.nodes = data.nodes;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '章节剧情加载失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 拉取任务剧情节点（失败码：QUEST_NOT_FOUND）。 */
  async loadQuest(code: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.story.quest(code);
      const data = result.data;
      if (data === undefined) throw new Error('任务剧情响应缺少 data');
      runInAction(() => {
        this.questNodes = data.nodes;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '任务剧情加载失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** 标记剧情节点已读并本地同步 `seen`（失败码：INVALID_PARAM）。 */
  async markSeen(nodeKey: string): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const result = await this.ctx.game.story.seen(nodeKey);
      const data = result.data;
      if (data === undefined) throw new Error('标记已读响应缺少 data');
      runInAction(() => {
        this.nodes = this.nodes.map((node) =>
          node.nodeKey === nodeKey ? { ...node, seen: true } : node,
        );
        this.questNodes = this.questNodes.map((node) =>
          node.nodeKey === nodeKey ? { ...node, seen: true } : node,
        );
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      this.ctx.toast.fromError(error, '标记已读失败');
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
