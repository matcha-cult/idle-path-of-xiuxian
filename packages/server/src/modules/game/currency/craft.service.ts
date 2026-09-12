/**
 * 炼器服务（七操作）：蜕变/点金/混沌/崇高/剥离/重铸/神圣
 *
 * 全部在 game 库同事务内完成：物品行锁 → 品阶/词缀校验 → 钱包原子扣减 → 物品更新。
 * 基底词缀（key=null）与天定词缀（定义行 is_fractured）在任何操作中保留。
 */
import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { CharacterService } from '../../character/character.service.js';
import { GameDatabaseService } from '../game-database.service.js';
import { ItemAffixService } from '../item/item.affix.service.js';
import type { AffixEntry, BaseRow } from '../item/item.types.js';
import { type CraftOp, type FailResult, fail, CRAFT_OPS } from './currency.types.js';

interface ItemWithBase {
  id: string;
  character_id: number | null;
  base_id: number;
  rarity: number;
  tier: number;
  quality: number;
  affixes: string | null;
  status: string;
  code: string;
  name: string;
  category: string;
  slot: string | null;
  created_at: string | Date;
}

@Injectable()
export class CraftService {
  constructor(
    private readonly gameDb: GameDatabaseService,
    private readonly characterService: CharacterService,
    private readonly affixService: ItemAffixService,
  ) {}

  private randInt(min: number, max: number): number {
    return min + randomInt(max - min + 1);
  }

  private parseEntries(raw: string | null): AffixEntry[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as AffixEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async craft(
    userId: number,
    itemId: number,
    op: string,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    if (!(CRAFT_OPS as readonly string[]).includes(op)) {
      return fail('INVALID_OP', `未知炼器操作：${op}`);
    }
    const character = await this.characterService.findByUserId(userId);
    if (!character) return fail('CHARACTER_NOT_FOUND', '尚未创建角色');
    const craftOp = op as CraftOp;

    const result = await this.gameDb.withTransaction(async (tx) => {
      const rows = await tx.query<ItemWithBase>(
        `SELECT i.id, i.character_id, i.base_id, i.rarity, i.tier, i.quality, i.affixes, i.status, i.created_at,
                b.code, b.name, b.category, b.slot
         FROM game_items i JOIN game_item_bases b ON b.id = i.base_id
         WHERE i.id = $1 FOR UPDATE`,
        [itemId],
      );
      const item = rows.rows[0];
      if (!item) return { ok: false as const, result: fail('ITEM_NOT_FOUND', '物品不存在') };
      if (item.character_id !== character.id) return { ok: false as const, result: fail('ITEM_NOT_OWNED', '物品不属于当前角色') };
      if (item.status !== 'bag') return { ok: false as const, result: fail('ITEM_NOT_IN_BAG', '仅背包中的物品可炼器') };
      if (Number(item.rarity) === 3) return { ok: false as const, result: fail('LEGENDARY_IMMUTABLE', '传奇物品词缀固定，不可洗炼') };

      const base: BaseRow = {
        id: Number(item.base_id),
        code: item.code,
        name: item.name,
        category: item.category,
        slot: item.slot,
        sub_type: null,
        tier: Number(item.tier),
        base_stats: null,
        implicit_affixes: null,
        unique_affixes: null,
        rarity_limit: 2,
        drop_weight: 100,
      };

      const entries = this.parseEntries(item.affixes);
      const fixedEntries = entries.filter((e) => e.key == null); // 基底/固定词缀
      const rolled = entries.filter((e) => e.key != null && e.value != null);
      const rolledRows = await this.affixService.findAffixesByIds(rolled.map((e) => e.affixId));
      const fracturedIdSet = new Set(rolledRows.filter((r) => r.is_fractured).map((r) => r.id));
      const fracturedEntries = rolled.filter((e) => fracturedIdSet.has(e.affixId));
      const normalRolled = rolled.filter((e) => !fracturedIdSet.has(e.affixId));

      const rarity = Number(item.rarity);
      let newRarity = rarity;
      let newRolled: AffixEntry[] = [];

      switch (craftOp) {
        case 'transmute': {
          if (rarity !== 0) return { ok: false as const, result: fail('RARITY_MISMATCH', '蜕变石仅限凡品') };
          const total = this.randInt(1, 2);
          const { prefixCount, suffixCount } = this.affixService.allocCountsFor(total, 1, 1);
          newRolled = await this.affixService.rollRollableEntries(base, prefixCount, suffixCount);
          newRarity = 1;
          break;
        }
        case 'alchemy': {
          if (rarity !== 0) return { ok: false as const, result: fail('RARITY_MISMATCH', '点金石仅限凡品') };
          const total = this.randInt(3, 6);
          const { prefixCount, suffixCount } = this.affixService.allocCountsFor(total, 3, 3);
          newRolled = await this.affixService.rollRollableEntries(base, prefixCount, suffixCount);
          newRarity = 2;
          break;
        }
        case 'chaos': {
          if (rarity !== 1 && rarity !== 2) return { ok: false as const, result: fail('RARITY_MISMATCH', '混沌石仅限灵品/宝品') };
          const total = rarity === 1 ? this.randInt(1, 2) : this.randInt(3, 6);
          const { prefixCount, suffixCount } = this.affixService.allocCountsFor(total, rarity === 1 ? 1 : 3, rarity === 1 ? 1 : 3);
          newRolled = await this.affixService.rollRollableEntries(base, prefixCount, suffixCount);
          break;
        }
        case 'exalt': {
          if (rarity !== 1 && rarity !== 2) return { ok: false as const, result: fail('RARITY_MISMATCH', '崇高石需灵品及以上') };
          const prefixCount = normalRolled.filter((e) => e.polarity === 'prefix').length;
          const suffixCount = normalRolled.filter((e) => e.polarity === 'suffix').length;
          if (rarity === 1) {
            if (prefixCount + suffixCount >= 2) {
              newRarity = 2;
            }
            const side: 'prefix' | 'suffix' = prefixCount === 1 && suffixCount === 0 ? 'suffix' : 'prefix';
            newRolled = normalRolled.concat(
              await this.affixService.rollRollableEntries(base, side === 'prefix' ? 1 : 0, side === 'suffix' ? 1 : 0),
            );
            break;
          }
          if (prefixCount + suffixCount >= 6) return { ok: false as const, result: fail('MAX_AFFIXES', '宝品词缀已达 6 条上限') };
          const pick: 'prefix' | 'suffix' = prefixCount >= 3 ? 'suffix' : suffixCount >= 3 ? 'prefix' : Math.random() < 0.5 ? 'prefix' : 'suffix';
          newRolled = normalRolled.concat(
            await this.affixService.rollRollableEntries(base, pick === 'prefix' ? 1 : 0, pick === 'suffix' ? 1 : 0),
          );
          break;
        }
        case 'annul': {
          if (normalRolled.length === 0) return { ok: false as const, result: fail('NO_AFFIX_TO_REMOVE', '没有可剥离的词缀') };
          const index = randomInt(normalRolled.length);
          newRolled = normalRolled.filter((_, i) => i !== index);
          break;
        }
        case 'scour': {
          if (rarity !== 1 && rarity !== 2) return { ok: false as const, result: fail('RARITY_MISMATCH', '重铸石仅限灵品/宝品') };
          newRolled = [];
          newRarity = 0;
          break;
        }
        case 'divine': {
          if (rarity !== 1 && rarity !== 2) return { ok: false as const, result: fail('RARITY_MISMATCH', '神圣石仅限灵品/宝品') };
          if (normalRolled.length === 0) return { ok: false as const, result: fail('AFFIX_LIMIT', '没有可重roll数值的词缀') };
          newRolled = await this.affixService.rerollEntryValues(normalRolled);
          break;
        }
      }

      // 钱包原子扣减（同事务）
      const dec = await tx.query<{ amount: string }>(
        `UPDATE game_wallets SET amount = amount - 1, updated_at = CURRENT_TIMESTAMP
         WHERE character_id = $1 AND currency_code = $2 AND amount >= 1 RETURNING amount`,
        [character.id, craftOp],
      );
      if (dec.rows.length === 0) {
        return { ok: false as const, result: fail('NOT_ENOUGH_CURRENCY', `通货不足：需要 1 枚对应工艺通货`) };
      }

      const finalEntries = [...fixedEntries, ...fracturedEntries, ...newRolled];
      await tx.query('UPDATE game_items SET rarity = $1, affixes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [
        newRarity,
        JSON.stringify(finalEntries),
        item.id,
      ]);
      return { ok: true as const, result: { item, newRarity, finalEntries } };
    });

    if (!result.ok) return result.result as FailResult;
    const { item, newRarity, finalEntries } = result.result;
    const view = await this.affixService.renderItem(
      Number(item.id),
      Number(item.base_id),
      item.code,
      item.name,
      item.category,
      item.slot,
      newRarity,
      Number(item.tier),
      Number(item.quality),
      item.status,
      finalEntries,
      item.created_at,
    );
    return { success: true, message: `炼器成功：${item.name}`, data: { item: view } };
  }
}
