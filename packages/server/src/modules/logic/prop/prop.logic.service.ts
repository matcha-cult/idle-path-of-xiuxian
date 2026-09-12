/**
 * prop 逻辑服门面（L0，依赖 item）
 *
 * 职责：道具流转（获得/消耗/丢弃/分解/出售）的门禁与编排。
 * 只经 item 门面操作物品存储，不直接触物品表。
 */
import { Injectable } from '@nestjs/common';
import { ItemLogicService } from '../item/item.logic.service.js';

@Injectable()
export class PropLogicService {
  constructor(private readonly itemLogic: ItemLogicService) {}

  discard(userId: number, itemId: number) {
    return this.itemLogic.discard(userId, itemId);
  }

  generate(userId: number, baseId: number, rarity: number, characterId: number | null) {
    return this.itemLogic.generate(userId, baseId, rarity, characterId);
  }
}
