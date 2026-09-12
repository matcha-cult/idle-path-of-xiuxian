/**
 * quest 逻辑服 Action（L3，cmd 段 110，依赖 zone, combat, item）
 *
 * (110,1) list          任务列表
 * (110,2) detail        任务详情 { code }
 * (110,3) sync          推进任务（幂等）
 * (110,4) chapterList   章节列表
 * (110,5) chapterDetail 章节详情 { chapter }（序号或 code）
 * (110,6) chapterSync   章节完成判定与发奖（幂等）
 *
 * 行为对齐旧 REST：/api/game/quests*、/api/game/quest/sync、/api/game/chapters*、/api/game/chapter/sync
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { QUEST_CMD } from '../../../ionet/cmd.js';
import { ActionError, dataOf, requireUserId } from '../../../ionet/action-support.js';
import { QuestLogicService } from './quest.logic.service.js';

@Injectable()
@ActionController(QUEST_CMD.cmd)
export class QuestAction {
  constructor(private readonly questLogic: QuestLogicService) {}

  @ActionMethod(QUEST_CMD.list)
  async list(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.questLogic.list(userId);
  }

  @ActionMethod(QUEST_CMD.detail)
  async detail(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const code = dataOf(data).code;
    if (typeof code !== 'string' || !code.trim()) return ActionError.invalidParam('code 必填');
    return this.questLogic.detail(userId, code.trim());
  }

  @ActionMethod(QUEST_CMD.sync)
  async sync(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.questLogic.sync(userId);
  }

  @ActionMethod(QUEST_CMD.chapterList)
  async chapterList(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.questLogic.chapterList(userId);
  }

  @ActionMethod(QUEST_CMD.chapterDetail)
  async chapterDetail(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const chapter = dataOf(data).chapter;
    if (typeof chapter !== 'string' || !chapter.trim()) return ActionError.invalidParam('chapter 必填');
    return this.questLogic.chapterDetail(userId, chapter.trim());
  }

  @ActionMethod(QUEST_CMD.chapterSync)
  async chapterSync(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.questLogic.chapterSync(userId);
  }
}
