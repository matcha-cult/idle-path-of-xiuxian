/**
 * item 逻辑服门面（L-1）
 *
 * 职责：物品基底/词缀/实例化/背包存储读写/拾取规则。
 * 上层 prop / equip / economy / combat 只允许经本门面操作物品与词缀，不得直接访问物品表或 `internal/`。
 */
import { Injectable } from '@nestjs/common';
import { ItemAffixService } from './internal/item.affix.service.js';
import { ItemService } from './internal/item.service.js';
import type { AffixEntry, AffixRow, BaseRow } from './internal/item.types.js';

@Injectable()
export class ItemLogicService {
  constructor(
    private readonly itemService: ItemService,
    private readonly affixService: ItemAffixService,
  ) {}

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

  // ===== 供 economy / combat 复用的词缀原语 =====

  /** 直接按基底实例化物品（掉落/生成），不做用户门禁 */
  generateItem(baseId: number, rarity: number, characterId: number | null = null) {
    return this.affixService.generateItem(baseId, rarity, characterId);
  }

  findAffixesByIds(ids: number[]) {
    return this.affixService.findAffixesByIds(ids);
  }

  allocCountsFor(total: number, maxPrefix: number, maxSuffix: number) {
    return this.affixService.allocCountsFor(total, maxPrefix, maxSuffix);
  }

  rollRollableEntries(base: BaseRow, prefixCount: number, suffixCount: number) {
    return this.affixService.rollRollableEntries(base, prefixCount, suffixCount);
  }

  rerollEntryValues(entries: AffixEntry[]) {
    return this.affixService.rerollEntryValues(entries);
  }

  queryRollPoolFor(base: BaseRow, polarity: 'prefix' | 'suffix') {
    return this.affixService.queryRollPoolFor(base, polarity);
  }

  rollOneFromRows(rows: AffixRow[]) {
    return this.affixService.rollOneFromRows(rows);
  }

  samplePoolRows(rows: AffixRow[], k: number) {
    return this.affixService.samplePoolRows(rows, k);
  }

  rollRow(row: AffixRow) {
    return this.affixService.rollRow(row);
  }

  renderItem(...args: Parameters<ItemAffixService['renderItem']>) {
    return this.affixService.renderItem(...args);
  }
}
