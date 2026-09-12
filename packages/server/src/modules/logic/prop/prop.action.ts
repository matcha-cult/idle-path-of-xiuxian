/**
 * prop 逻辑服 Action（L0，cmd 段 40，依赖 item）
 *
 * (40,1) discard   丢弃道具 { itemId }
 * (40,2) generate  生成物品（dev：生产禁用/归属校验/限流） { baseId, rarity, characterId? }
 *
 * 行为对齐旧 REST：POST /api/game/item/discard、POST /api/game/item/generate
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { PROP_CMD } from '../../../ionet/cmd.js';
import { ActionError, dataOf, requireUserId, toFiniteInt } from '../../../ionet/action-support.js';
import { PropLogicService } from './prop.logic.service.js';

@Injectable()
@ActionController(PROP_CMD.cmd)
export class PropAction {
  constructor(private readonly propLogic: PropLogicService) {}

  @ActionMethod(PROP_CMD.discard)
  async discard(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const itemId = toFiniteInt(dataOf(data).itemId);
    if (itemId == null) return ActionError.invalidParam('itemId 不合法');
    return this.propLogic.discard(userId, itemId);
  }

  @ActionMethod(PROP_CMD.generate)
  async generate(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const body = dataOf(data);
    const baseId = toFiniteInt(body.baseId);
    const rarity = toFiniteInt(body.rarity);
    if (baseId == null || rarity == null) {
      return ActionError.invalidParam('baseId 与 rarity 必填且为整数');
    }
    const characterId = body.characterId != null ? (toFiniteInt(body.characterId) ?? null) : null;
    return this.propLogic.generate(userId, baseId, rarity, characterId);
  }
}
