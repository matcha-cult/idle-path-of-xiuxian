/**
 * skill 逻辑服 Action（L0，cmd 段 60，依赖 character）
 *
 * (60,1) list         功法图鉴
 * (60,2) learn        修习 { skillId }
 * (60,3) panel        面板查看
 * (60,4) panelUpdate  装槽/换装 { ...面板载荷 }
 * (60,5) enlighten    参悟 { skillId }
 * (60,6) lingyunGrant 开发注入灵韵 { amount }
 * (60,7) jadeGrant    开发发放玉简 { count }
 *
 * 行为对齐旧 REST：/api/game/skills、/api/game/skill/*、/api/game/lingyun/grant
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { SKILL_CMD } from '../../../ionet/cmd.js';
import { ActionError, dataOf, requireUserId, toFiniteInt } from '../../../ionet/action-support.js';
import { SkillLogicService } from './skill.logic.service.js';

@Injectable()
@ActionController(SKILL_CMD.cmd)
export class SkillAction {
  constructor(private readonly skillLogic: SkillLogicService) {}

  @ActionMethod(SKILL_CMD.list)
  async list(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.skillLogic.catalog(userId);
  }

  @ActionMethod(SKILL_CMD.learn)
  async learn(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const skillId = toFiniteInt(dataOf(data).skillId);
    if (skillId == null) return ActionError.invalidParam('skillId 不合法');
    return this.skillLogic.learn(userId, skillId);
  }

  @ActionMethod(SKILL_CMD.panel)
  async panel(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.skillLogic.getPanel(userId);
  }

  @ActionMethod(SKILL_CMD.panelUpdate)
  async panelUpdate(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.skillLogic.putPanel(userId, dataOf(data));
  }

  @ActionMethod(SKILL_CMD.enlighten)
  async enlighten(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const skillId = toFiniteInt(dataOf(data).skillId);
    if (skillId == null) return ActionError.invalidParam('skillId 不合法');
    return this.skillLogic.enlighten(userId, skillId);
  }

  @ActionMethod(SKILL_CMD.lingyunGrant)
  async lingyunGrant(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const amount = toFiniteInt(dataOf(data).amount);
    if (amount == null) return ActionError.invalidParam('amount 不合法');
    return this.skillLogic.grantLingyun(userId, amount);
  }

  @ActionMethod(SKILL_CMD.jadeGrant)
  async jadeGrant(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const count = toFiniteInt(dataOf(data).count);
    if (count == null) return ActionError.invalidParam('count 不合法');
    return this.skillLogic.grantJade(userId, count);
  }
}
