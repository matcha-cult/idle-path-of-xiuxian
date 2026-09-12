/**
 * item 逻辑服 Action（L-1，cmd 段 30）
 *
 * (30,1) inventory        背包列表 { category?, rarity?, tierMin?, tierMax?, page?, pageSize? }
 * (30,2) inventoryDetail  物品详情 { id }
 * (30,3) bases            基底库   { category?, tier?, page?, pageSize?, withPool? }
 * (30,4) pickupRuleList   拾取规则列表
 * (30,5) pickupRuleCreate 新建规则 { name, rarityMin?, tierMin?, affixCodes?, action?, enabled?, priority? }
 * (30,6) pickupRuleUpdate 更新规则 { id, ...部分字段 }
 * (30,7) pickupRuleDelete 删除规则 { id }
 *
 * 行为对齐旧 REST：GET /api/game/inventory*、/api/game/item/bases、/api/game/pickup-rules*
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { ITEM_CMD } from '../../../ionet/cmd.js';
import { ActionError, dataOf, requireUserId, toFiniteInt } from '../../../ionet/action-support.js';
import { ItemLogicService } from './item.logic.service.js';

@Injectable()
@ActionController(ITEM_CMD.cmd)
export class ItemAction {
  constructor(private readonly itemLogic: ItemLogicService) {}

  @ActionMethod(ITEM_CMD.inventory)
  async inventory(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const body = dataOf(data);
    return this.itemLogic.inventory(userId, {
      category: typeof body.category === 'string' && body.category ? body.category : undefined,
      rarity: toFiniteInt(body.rarity),
      tierMin: toFiniteInt(body.tierMin),
      tierMax: toFiniteInt(body.tierMax),
      page: toFiniteInt(body.page) ?? 1,
      pageSize: toFiniteInt(body.pageSize) ?? 20,
    });
  }

  @ActionMethod(ITEM_CMD.inventoryDetail)
  async inventoryDetail(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const itemId = toFiniteInt(dataOf(data).id);
    if (itemId == null) return ActionError.invalidParam('物品 id 不合法');
    return this.itemLogic.detail(userId, itemId);
  }

  @ActionMethod(ITEM_CMD.bases)
  async bases(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const body = dataOf(data);
    const withPoolRaw = body.withPool;
    return this.itemLogic.bases({
      category: typeof body.category === 'string' && body.category ? body.category : undefined,
      tier: toFiniteInt(body.tier),
      page: toFiniteInt(body.page) ?? 1,
      pageSize: toFiniteInt(body.pageSize) ?? 20,
      withPool: withPoolRaw === 1 || withPoolRaw === '1' ? 1 : 0,
    });
  }

  @ActionMethod(ITEM_CMD.pickupRuleList)
  async pickupRuleList(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.itemLogic.listPickupRules(userId);
  }

  @ActionMethod(ITEM_CMD.pickupRuleCreate)
  async pickupRuleCreate(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const body = dataOf(data);
    return this.itemLogic.createPickupRule(userId, {
      name: body.name,
      rarityMin: body.rarityMin,
      tierMin: body.tierMin,
      affixCodes: body.affixCodes,
      action: body.action,
      enabled: body.enabled,
      priority: body.priority,
    });
  }

  @ActionMethod(ITEM_CMD.pickupRuleUpdate)
  async pickupRuleUpdate(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const body = dataOf(data);
    const ruleId = toFiniteInt(body.id ?? body.ruleId);
    if (ruleId == null) return ActionError.invalidParam('规则 id 不合法');
    return this.itemLogic.updatePickupRule(userId, ruleId, {
      name: body.name,
      rarityMin: body.rarityMin,
      tierMin: body.tierMin,
      affixCodes: body.affixCodes,
      action: body.action,
      enabled: body.enabled,
      priority: body.priority,
    });
  }

  @ActionMethod(ITEM_CMD.pickupRuleDelete)
  async pickupRuleDelete(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const ruleId = toFiniteInt(dataOf(data).id ?? dataOf(data).ruleId);
    if (ruleId == null) return ActionError.invalidParam('规则 id 不合法');
    return this.itemLogic.deletePickupRule(userId, ruleId);
  }
}
