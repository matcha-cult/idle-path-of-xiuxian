/**
 * economy 逻辑服 Action（L1，cmd 段 70，依赖 item, prop）
 *
 * (70,1) currencies    通货图鉴
 * (70,2) currencyGrant 注入通货 { code, count }
 * (70,3) craft         炼器操作 { itemId, op, essenceCode?, targetCode? }
 * (70,4) essences      精华图鉴
 * (70,5) essenceGrant  发放精华 { code, count }
 *
 * 行为对齐旧 REST：/api/game/currencies、/api/game/currency/grant、/api/game/item/craft、/api/game/essences、/api/game/essence/grant
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { ECONOMY_CMD } from '../../../ionet/cmd.js';
import { ActionError, dataOf, requireUserId, toFiniteInt } from '../../../ionet/action-support.js';
import { EconomyLogicService } from './economy.logic.service.js';

@Injectable()
@ActionController(ECONOMY_CMD.cmd)
export class EconomyAction {
  constructor(private readonly economyLogic: EconomyLogicService) {}

  @ActionMethod(ECONOMY_CMD.currencies)
  async currencies(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.economyLogic.currencies(userId);
  }

  @ActionMethod(ECONOMY_CMD.currencyGrant)
  async currencyGrant(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const body = dataOf(data);
    if (typeof body.code !== 'string' || !body.code.trim()) return ActionError.invalidParam('code 必填');
    const count = toFiniteInt(body.count);
    if (count == null) return ActionError.invalidParam('count 不合法');
    return this.economyLogic.grantCurrency(userId, body.code.trim(), count);
  }

  @ActionMethod(ECONOMY_CMD.craft)
  async craft(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const body = dataOf(data);
    const itemId = toFiniteInt(body.itemId);
    if (itemId == null) return ActionError.invalidParam('itemId 不合法');
    if (typeof body.op !== 'string' || !body.op.trim()) return ActionError.invalidParam('op 必填');
    const extraCode =
      typeof body.essenceCode === 'string' && body.essenceCode.trim()
        ? body.essenceCode.trim()
        : typeof body.targetCode === 'string' && body.targetCode.trim()
          ? body.targetCode.trim()
          : undefined;
    return this.economyLogic.craft(userId, itemId, body.op.trim(), extraCode);
  }

  @ActionMethod(ECONOMY_CMD.essences)
  async essences(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.economyLogic.essences(userId);
  }

  @ActionMethod(ECONOMY_CMD.essenceGrant)
  async essenceGrant(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const body = dataOf(data);
    if (typeof body.code !== 'string' || !body.code.trim()) return ActionError.invalidParam('code 必填');
    const count = toFiniteInt(body.count);
    if (count == null) return ActionError.invalidParam('count 不合法');
    return this.economyLogic.grantEssence(userId, body.code.trim(), count);
  }
}
