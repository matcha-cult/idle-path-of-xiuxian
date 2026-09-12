/**
 * 炼器服务（十二操作）：蜕变/点金/混沌/崇高/剥离/重铸/神圣 + 祝福/映道/瓦尔/破溃/古灵余烬
 *
 * 事务模型：game 库同事务——物品行锁 → 品阶/状态/变异校验 → 变异计算 → 钱包原子扣减 → 落库。
 * 保全规则：基底词缀（key=null 且 polarity=base）与天定词缀（entry.fractured 或定义行 is_fractured）
 *           在任何重 roll/剥离/重铸中保留；入魔为追加固定词缀，自动受保全。
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
  base_stats: string | null;
  mirrored: boolean;
  vaaled: boolean;
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

  /** 数值 ×1.5：整数保持整数，非整数取 1 位小数 */
  private scale1p5(value: number): number {
    const v = value * 1.5;
    return Number.isInteger(v) ? v : Number(v.toFixed(1));
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
        `SELECT i.id, i.character_id, i.base_id, i.rarity, i.tier, i.quality, i.affixes,
                i.base_stats, i.mirrored, i.vaaled, i.status, i.created_at,
                b.code, b.name, b.category, b.slot, b.base_stats AS base_base_stats
         FROM game_items i JOIN game_item_bases b ON b.id = i.base_id
         WHERE i.id = $1 FOR UPDATE`,
        [itemId],
      );
      const item = rows.rows[0] as ItemWithBase & { base_base_stats: string | null };
      if (!item) return { verdict: 'fail' as const, result: fail('ITEM_NOT_FOUND', '物品不存在') };
      if (item.character_id !== character.id) return { verdict: 'fail' as const, result: fail('ITEM_NOT_OWNED', '物品不属于当前角色') };
      if (item.status !== 'bag') return { verdict: 'fail' as const, result: fail('ITEM_NOT_IN_BAG', '仅背包中的物品可炼器') };
      if (Number(item.rarity) === 3) return { verdict: 'fail' as const, result: fail('LEGENDARY_IMMUTABLE', '传奇物品词缀固定，不可洗炼') };
      if (item.vaaled) return { verdict: 'fail' as const, result: fail('VAALED_IMMUTABLE', '瓦尔变异不可逆，此后不可再洗炼') };

      const rarity = Number(item.rarity);
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
      const fixedEntries = entries.filter((e) => e.key == null);
      const baseEntries = entries.filter((e) => e.polarity === 'base' && e.key == null);
      const nonBaseEntries = entries.filter((e) => !(e.polarity === 'base' && e.key == null));
      const rolled = entries.filter((e) => e.key != null && e.value != null);
      const rolledRows = await this.affixService.findAffixesByIds(rolled.map((e) => e.affixId));
      const fracturedIdSet = new Set(rolledRows.filter((r) => r.is_fractured).map((r) => r.id));
      const fracturedEntries = rolled.filter((e) => e.fractured || fracturedIdSet.has(e.affixId));
      const normalRolled = rolled.filter((e) => !e.fractured && !fracturedIdSet.has(e.affixId));

      let newRarity = rarity;
      let newRolled: AffixEntry[] = normalRolled;
      let finalEntries: AffixEntry[] = entries;
      let extra: Record<string, unknown> = {};
      let destroyed = false;

      switch (craftOp) {
        case 'transmute': {
          if (rarity !== 0) return { verdict: 'fail' as const, result: fail('RARITY_MISMATCH', '蜕变石仅限凡品') };
          const total = this.randInt(1, 2);
          const { prefixCount, suffixCount } = this.affixService.allocCountsFor(total, 1, 1);
          newRolled = await this.affixService.rollRollableEntries(base, prefixCount, suffixCount);
          newRarity = 1;
          break;
        }
        case 'alchemy': {
          if (rarity !== 0) return { verdict: 'fail' as const, result: fail('RARITY_MISMATCH', '点金石仅限凡品') };
          const total = this.randInt(3, 6);
          const { prefixCount, suffixCount } = this.affixService.allocCountsFor(total, 3, 3);
          newRolled = await this.affixService.rollRollableEntries(base, prefixCount, suffixCount);
          newRarity = 2;
          break;
        }
        case 'chaos': {
          if (rarity !== 1 && rarity !== 2) return { verdict: 'fail' as const, result: fail('RARITY_MISMATCH', '混沌石仅限灵品/宝品') };
          const total = rarity === 1 ? this.randInt(1, 2) : this.randInt(3, 6);
          const { prefixCount, suffixCount } = this.affixService.allocCountsFor(total, rarity === 1 ? 1 : 3, rarity === 1 ? 1 : 3);
          newRolled = await this.affixService.rollRollableEntries(base, prefixCount, suffixCount);
          break;
        }
        case 'exalt': {
          if (rarity !== 1 && rarity !== 2) return { verdict: 'fail' as const, result: fail('RARITY_MISMATCH', '崇高石需灵品及以上') };
          const prefixCount = normalRolled.filter((e) => e.polarity === 'prefix').length;
          const suffixCount = normalRolled.filter((e) => e.polarity === 'suffix').length;
          if (rarity === 1) {
            if (prefixCount + suffixCount >= 2) newRarity = 2;
            const side: 'prefix' | 'suffix' = prefixCount === 1 && suffixCount === 0 ? 'suffix' : 'prefix';
            newRolled = normalRolled.concat(
              await this.affixService.rollRollableEntries(base, side === 'prefix' ? 1 : 0, side === 'suffix' ? 1 : 0),
            );
            break;
          }
          if (prefixCount + suffixCount >= 6) return { verdict: 'fail' as const, result: fail('MAX_AFFIXES', '宝品词缀已达 6 条上限') };
          const pick: 'prefix' | 'suffix' = prefixCount >= 3 ? 'suffix' : suffixCount >= 3 ? 'prefix' : Math.random() < 0.5 ? 'prefix' : 'suffix';
          newRolled = normalRolled.concat(
            await this.affixService.rollRollableEntries(base, pick === 'prefix' ? 1 : 0, pick === 'suffix' ? 1 : 0),
          );
          break;
        }
        case 'annul': {
          if (normalRolled.length === 0) return { verdict: 'fail' as const, result: fail('NO_AFFIX_TO_REMOVE', '没有可剥离的词缀') };
          const index = randomInt(normalRolled.length);
          newRolled = normalRolled.filter((_, i) => i !== index);
          break;
        }
        case 'scour': {
          if (rarity !== 1 && rarity !== 2) return { verdict: 'fail' as const, result: fail('RARITY_MISMATCH', '重铸石仅限灵品/宝品') };
          newRolled = [];
          newRarity = 0;
          break;
        }
        case 'divine': {
          if (rarity !== 1 && rarity !== 2) return { verdict: 'fail' as const, result: fail('RARITY_MISMATCH', '神圣石仅限灵品/宝品') };
          if (normalRolled.length === 0) return { verdict: 'fail' as const, result: fail('AFFIX_LIMIT', '没有可重roll数值的词缀') };
          newRolled = await this.affixService.rerollEntryValues(normalRolled);
          break;
        }
        case 'blessed': {
          if (rarity > 2) return { verdict: 'fail' as const, result: fail('RARITY_MISMATCH', '祝福石不可用于传奇') };
          const baseStats = this.parseBaseStats(item.base_base_stats);
          const overridden: Record<string, number> = {};
          for (const [k, v] of Object.entries(baseStats)) {
            const floated = v * (0.95 + Math.random() * 0.1);
            overridden[k] = Number.isInteger(floated) ? floated : Number(floated.toFixed(1));
          }
          extra = { baseStats: overridden };
          break;
        }
        case 'mirror': {
          if (item.mirrored) return { verdict: 'fail' as const, result: fail('MIRROR_IMMUTABLE', '镜像不可再复制') };
          break;
        }
        case 'vaal': {
          const roll = Math.random();
          if (roll < 0.6) {
            const idx = randomInt(normalRolled.length || 1);
            if (normalRolled.length > 0) {
              const target = normalRolled[idx] as AffixEntry;
              target.value = target.value != null ? this.scale1p5(target.value) : null;
              newRolled = normalRolled;
              extra = { outcome: 'empowered' };
            } else {
              extra = { outcome: 'empowered' };
            }
          } else if (roll < 0.9) {
            const demon = await tx.query<{ id: number }>(
              "SELECT id FROM game_affixes WHERE code = 'vaal_demonic'",
            );
            const demonId = demon.rows[0]?.id;
            if (demonId) {
              fixedEntries.push({ affixId: Number(demonId), value: null, polarity: 'suffix', key: null });
            }
            extra = { outcome: 'demonic' };
          } else {
            destroyed = true;
          }
          break;
        }
        case 'fracture': {
          if (rarity !== 2) return { verdict: 'fail' as const, result: fail('FRACTURE_REQUIREMENT', '破溃宝珠仅限宝品') };
          if (normalRolled.length < 4) return { verdict: 'fail' as const, result: fail('FRACTURE_REQUIREMENT', '宝品至少 4 条词缀方可锁定天定铭文') };
          const idx = randomInt(normalRolled.length);
          normalRolled[idx] = { ...normalRolled[idx], fractured: true };
          newRolled = normalRolled;
          break;
        }
        case 'ember': {
          if (rarity > 2) return { verdict: 'fail' as const, result: fail('RARITY_MISMATCH', '古灵余烬不可用于传奇') };
          const pool = await tx.query<{ id: number }>(
            "SELECT id FROM game_affixes WHERE polarity = 'base'",
          );
          const poolIds = pool.rows.map((r) => Number(r.id));
          const currentBaseIds = new Set(baseEntries.map((e) => e.affixId));
          const candidates = poolIds.filter((id) => !currentBaseIds.has(id));
          if (candidates.length === 0) return { verdict: 'fail' as const, result: fail('AFFIX_LIMIT', '无新的基底词缀可选') };
          const pick = candidates[randomInt(candidates.length)];
          finalEntries = [{ affixId: pick, value: null, polarity: 'base', key: null }, ...nonBaseEntries];
          break;
        }
      }

      // 钱包原子扣减（destroyed 同样消耗 1 枚）
      const dec = await tx.query<{ amount: string }>(
        `UPDATE game_wallets SET amount = amount - 1, updated_at = CURRENT_TIMESTAMP
         WHERE character_id = $1 AND currency_code = $2 AND amount >= 1 RETURNING amount`,
        [character.id, craftOp],
      );
      if (dec.rows.length === 0) {
        return { verdict: 'fail' as const, result: fail('NOT_ENOUGH_CURRENCY', `通货不足：需要 1 枚对应工艺通货`) };
      }

      if (destroyed) {
        await tx.query('DELETE FROM game_items WHERE id = $1', [item.id]);
        return { verdict: 'ok' as const, result: { item, newRarity, finalEntries, destroyed: true, extra } };
      }

      if (craftOp === 'mirror') {
        const copied = await tx.query<{ id: string }>(
          `INSERT INTO game_items (character_id, base_id, rarity, tier, quality, affixes, base_stats, mirrored, vaaled, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, FALSE, 'bag') RETURNING id`,
          [character.id, item.base_id, rarity, item.tier, item.quality, item.affixes, item.base_stats],
        );
        return { verdict: 'ok' as const, result: { item: { ...item, id: copied.rows[0].id }, newRarity, finalEntries: entries, destroyed: false, extra: { mirroredCopyId: Number(copied.rows[0].id) } } };
      }

      if (craftOp === 'blessed') {
        finalEntries = entries;
        newRarity = rarity;
        await tx.query(
          'UPDATE game_items SET base_stats = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [JSON.stringify(extra.baseStats ?? {}), item.id],
        );
      } else if (craftOp !== 'ember') {
        finalEntries = [...fixedEntries, ...fracturedEntries, ...newRolled];
      }

      const finalRarity = newRarity;
      const finalAffixes = JSON.stringify(finalEntries);
      if (craftOp === 'vaal') {
        await tx.query(
          "UPDATE game_items SET rarity = $1, affixes = $2, vaaled = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
          [finalRarity, finalAffixes, item.id],
        );
      } else {
        await tx.query(
          'UPDATE game_items SET rarity = $1, affixes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [finalRarity, finalAffixes, item.id],
        );
      }
      return { verdict: 'ok' as const, result: { item, newRarity: finalRarity, finalEntries, destroyed: false, extra } };
    });

    if (result.verdict === 'fail') return result.result as FailResult;
    const { item, newRarity, finalEntries, destroyed, extra } = result.result as {
      item: ItemWithBase;
      newRarity: number;
      finalEntries: AffixEntry[];
      destroyed: boolean;
      extra: Record<string, unknown>;
    };
    if (destroyed) {
      return { success: true, message: `瓦尔变异失败：${item.name} 已被摧毁`, data: { destroyed: true, itemId: Number(item.id) } };
    }
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
    return {
      success: true,
      message: `炼器成功：${item.name}${extra.outcome ? `（${extra.outcome}）` : ''}`,
      data: { item: view, ...extra },
    };
  }

  private parseBaseStats(raw: string | null): Record<string, number> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      return typeof parsed === 'object' && parsed != null ? parsed : {};
    } catch {
      return {};
    }
  }
}
