/**
 * story 逻辑服 Action（L3，cmd 段 120，依赖 quest）
 *
 * (120,1) chapter  章节剧本节点 { chapter }
 * (120,2) quest    任务剧本节点 { code }
 * (120,3) seen     标记节点已读 { nodeKey }
 *
 * 行为对齐旧 REST：/api/game/story/chapter/:chapter、/api/game/story/quest/:code、/api/game/story/seen
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { STORY_CMD } from '../../../ionet/cmd.js';
import { ActionError, dataOf, requireUserId } from '../../../ionet/action-support.js';
import { StoryLogicService } from './story.logic.service.js';

@Injectable()
@ActionController(STORY_CMD.cmd)
export class StoryAction {
  constructor(private readonly storyLogic: StoryLogicService) {}

  @ActionMethod(STORY_CMD.chapter)
  async chapter(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const chapter = dataOf(data).chapter;
    if (typeof chapter !== 'string' || !chapter.trim()) return ActionError.invalidParam('chapter 必填');
    return this.storyLogic.chapterStory(userId, chapter.trim());
  }

  @ActionMethod(STORY_CMD.quest)
  async quest(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const code = dataOf(data).code;
    if (typeof code !== 'string' || !code.trim()) return ActionError.invalidParam('code 必填');
    return this.storyLogic.questStory(userId, code.trim());
  }

  @ActionMethod(STORY_CMD.seen)
  async seen(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const nodeKey = dataOf(data).nodeKey;
    if (typeof nodeKey !== 'string' || !nodeKey.trim()) return ActionError.invalidParam('nodeKey 必填');
    return this.storyLogic.markSeen(userId, nodeKey);
  }
}
