/**
 * equip 逻辑服 Action（L0，cmd 段 50，依赖 item）
 *
 * (50,1) equip      穿戴 { itemId }
 * (50,2) unequip    卸下 { itemId }
 * (50,3) equipment  当前装备栏
 *
 * 行为对齐旧 REST：POST /api/game/item/equip|unequip、GET /api/game/equipment
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { EQUIP_CMD } from '../../../ionet/cmd.js';
import { ActionError, dataOf, requireUserId, toFiniteInt } from '../../../ionet/action-support.js';
import { EquipLogicService } from './equip.logic.service.js';

@Injectable()
@ActionController(EQUIP_CMD.cmd)
export class EquipAction {
  constructor(private readonly equipLogic: EquipLogicService) {}

  @ActionMethod(EQUIP_CMD.equip)
  async equip(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const itemId = toFiniteInt(dataOf(data).itemId);
    if (itemId == null) return ActionError.invalidParam('itemId 不合法');
    return this.equipLogic.equip(userId, itemId);
  }

  @ActionMethod(EQUIP_CMD.unequip)
  async unequip(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const itemId = toFiniteInt(dataOf(data).itemId);
    if (itemId == null) return ActionError.invalidParam('itemId 不合法');
    return this.equipLogic.unequip(userId, itemId);
  }

  @ActionMethod(EQUIP_CMD.equipment)
  async equipment(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.equipLogic.equipment(userId);
  }
}
