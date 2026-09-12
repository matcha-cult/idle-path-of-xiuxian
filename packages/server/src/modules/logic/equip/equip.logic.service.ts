/**
 * equip 逻辑服门面（L0，依赖 item）
 *
 * 职责：穿戴/卸下/装备栏与属性聚合入口。
 */
import { Injectable } from '@nestjs/common';
import { ItemLogicService } from '../item/item.logic.service.js';

@Injectable()
export class EquipLogicService {
  constructor(private readonly itemLogic: ItemLogicService) {}

  equip(userId: number, itemId: number) {
    return this.itemLogic.equip(userId, itemId);
  }

  unequip(userId: number, itemId: number) {
    return this.itemLogic.unequip(userId, itemId);
  }

  equipment(userId: number) {
    return this.itemLogic.equipment(userId);
  }
}
