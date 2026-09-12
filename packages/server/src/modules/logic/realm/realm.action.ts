/**
 * realm 逻辑服 Action（L1，cmd 段 80，依赖 character, prop）
 *
 * (80,1) breakthroughInfo  境界状态与下一境消耗
 * (80,2) breakthrough      突破（消耗灵韵）
 *
 * 行为对齐旧 REST：GET/POST /api/game/breakthrough
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { REALM_CMD } from '../../../ionet/cmd.js';
import { requireUserId } from '../../../ionet/action-support.js';
import { RealmLogicService } from './realm.logic.service.js';

@Injectable()
@ActionController(REALM_CMD.cmd)
export class RealmAction {
  constructor(private readonly realmLogic: RealmLogicService) {}

  @ActionMethod(REALM_CMD.breakthroughInfo)
  async breakthroughInfo(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.realmLogic.status(userId);
  }

  @ActionMethod(REALM_CMD.breakthrough)
  async breakthrough(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.realmLogic.breakthrough(userId);
  }
}
