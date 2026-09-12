/**
 * item 逻辑服门面（L-1）
 *
 * 职责：物品基底/词缀/实例化/背包存储读写/拾取规则。
 * 上层 prop / equip 只允许经本门面操作物品，不得直接访问物品表。
 */
import { Injectable } from '@nestjs/common';
import { ItemService } from '../../game/item/item.service.js';

@Injectable()
export class ItemLogicService {
  constructor(private readonly itemService: ItemService) {}

  inventory(
    userId: number,
    filters: {
      category?: string;
      rarity?: number;
      tierMin?: number;
      tierMax?: number;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.itemService.inventory(userId, filters);
  }

  detail(userId: number, itemId: number) {
    return this.itemService.detail(userId, itemId);
  }

  bases(filters: {
    category?: string;
    tier?: number;
    page?: number;
    pageSize?: number;
    withPool?: number;
  }) {
    return this.itemService.bases(filters);
  }

  listPickupRules(userId: number) {
    return this.itemService.listPickupRules(userId);
  }

  createPickupRule(userId: number, body: {
    name?: unknown;
    rarityMin?: unknown;
    tierMin?: unknown;
    affixCodes?: unknown;
    action?: unknown;
    enabled?: unknown;
    priority?: unknown;
  }) {
    return this.itemService.createPickupRule(userId, body);
  }

  updatePickupRule(userId: number, ruleId: number, body: {
    name?: unknown;
    rarityMin?: unknown;
    tierMin?: unknown;
    affixCodes?: unknown;
    action?: unknown;
    enabled?: unknown;
    priority?: unknown;
  }) {
    return this.itemService.updatePickupRule(userId, ruleId, body);
  }

  deletePickupRule(userId: number, ruleId: number) {
    return this.itemService.deletePickupRule(userId, ruleId);
  }

  // ===== 供上层 prop / equip 复用的物品原语 =====

  discard(userId: number, itemId: number) {
    return this.itemService.discard(userId, itemId);
  }

  generate(userId: number, baseId: number, rarity: number, characterId: number | null) {
    return this.itemService.generateItemForUser(userId, baseId, rarity, characterId);
  }

  equip(userId: number, itemId: number) {
    return this.itemService.equip(userId, itemId);
  }

  unequip(userId: number, itemId: number) {
    return this.itemService.unequip(userId, itemId);
  }

  equipment(userId: number) {
    return this.itemService.equipment(userId);
  }
}
