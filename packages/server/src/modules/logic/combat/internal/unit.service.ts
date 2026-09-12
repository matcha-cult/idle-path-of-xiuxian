/**
 * 单位服务（P4）：图鉴 / 掉落表 / 即时实例化 / 击杀结算 + 辨宝法阵执行
 *
 * - 单位模板与隐藏词条池、掉落表均在 game 库（data-driven seed）
 * - 单位实例不落库：按模板 + 境界模板即时计算战斗属性快照
 * - 击杀结算：灵韵（characters，用户库）+ 掉落（物品/钱包/精华，game 库）
 *   跨池无法同事务 → 各自原子写入（dev 接口，正式产出走 P4.2 离线结算）
 */
import { Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../../common/config/app-config.js';
import { RateLimiterService } from '../../../../common/services/rate-limiter.service.js';
import { CharacterService } from '../../../character/character.service.js';
import { DatabaseService } from '../../../database/database.service.js';
import { GameDatabaseService } from '../../../game/game-database.service.js';
import { ItemAffixService } from '../../../game/item/item.affix.service.js';
import { StatService } from '../../../game/stat/stat.service.js';
import type { BaseRow, ItemView } from '../../../game/item/item.types.js';
import { realmName } from '../../../../common/kernel/realm.js';
import {
  type DropEntryRow,
  type DropTableRow,
  type FailResult,
  type HiddenAffixRow,
  type HiddenAffixView,
  type PickupRuleRow,
  type UnitInstanceView,
  type UnitTemplateRow,
  fail,
  normalizeLootAction,
} from './unit.types.js';

/** 隐藏词条 percent 键 → 基础属性键 */
const STAT_MAP: Record<string, string> = {
  hp: 'hp',
  atk: 'atk',
  def: 'def',
  spirit_power: 'spiritPower',
};

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}

interface LoadedUnit {
  unit: UnitTemplateRow;
  pool: HiddenAffixRow[];
  table: DropTableRow | null;
  entries: DropEntryRow[];
}

interface CatalogFilters {
  realm?: number;
  camp?: string;
}

/** 一次结算（击杀/离线）的产出汇总 */
export interface SettlementData {
  unit: { code: string; name: string; realm: number };
  kills: number;
  lingyunGained: number;
  lingyunTotal: number;
  items: ItemView[];
  kept: number;
  salvaged: { count: number; lingyun: number };
  sold: { count: number; spiritStones: number };
  discarded: number;
  blockedByTier: number;
  currencies: Record<string, number>;
  essences: Record<string, number>;
  itemsProduced: number;
}

export type SettleResult = { ok: true; data: SettlementData } | { ok: false; result: FailResult };

@Injectable()
export class UnitService {
  private readonly baseById = new Map<number, BaseRow>();
  private readonly basesByTier = new Map<number, BaseRow[]>();

  constructor(
    private readonly gameDb: GameDatabaseService,
    private readonly userDb: DatabaseService,
    private readonly affixService: ItemAffixService,
    private readonly characterService: CharacterService,
    private readonly rateLimiter: RateLimiterService,
    private readonly statService: StatService,
  ) {}

  // ===== 门禁与工具 =====

  private productionGuard(): FailResult | null {
    if ((process.env.NODE_ENV ?? 'development') === 'production') {
      return fail('FORBIDDEN', '开发接口在生产环境不可用');
    }
    return null;
  }

  private async resolveCharacter(userId: number) {
    const character = await this.characterService.findByUserId(userId);
    if (!character) return { error: fail('CHARACTER_NOT_FOUND', '尚未创建角色') as FailResult };
    return { character };
  }

  private parseJson<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private randomRange(min: number, max: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  private weightedPickBy<T>(rows: T[], weightOf: (row: T) => number): T | null {
    if (rows.length === 0) return null;
    const total = rows.reduce((sum, r) => sum + (weightOf(r) > 0 ? weightOf(r) : 1), 0);
    let roll = Math.random() * total;
    for (const row of rows) {
      roll -= weightOf(row) > 0 ? weightOf(row) : 1;
      if (roll < 0) return row;
    }
    return rows[rows.length - 1];
  }

  private weightedPick<T extends { weight: number }>(rows: T[]): T | null {
    return this.weightedPickBy(rows, (r) => r.weight);
  }

  private weightedSample<T extends { id: number; weight: number }>(rows: T[], k: number): T[] {
    const picked: T[] = [];
    let candidates = [...rows];
    while (picked.length < k && candidates.length > 0) {
      const row = this.weightedPick(candidates);
      if (!row) break;
      picked.push(row);
      candidates = candidates.filter((c) => c.id !== row.id);
    }
    return picked;
  }

  // ===== 境界模板与实例化 =====

  private mergeBaseStats(realm: number, override: Record<string, number> | null): Record<string, number> {
    const rb = APP_CONFIG.unitRealmBase;
    const step = realm - 1;
    const out: Record<string, number> = {
      hp: Math.round(rb.hp.base * Math.pow(rb.hp.growth, step)),
      atk: Math.round(rb.atk.base * Math.pow(rb.atk.growth, step)),
      def: Math.round(rb.def.base * Math.pow(rb.def.growth, step)),
      spiritPower: Math.round(rb.spiritPower.base * Math.pow(rb.spiritPower.growth, step)),
    };
    if (override) {
      for (const [key, value] of Object.entries(override)) {
        const n = Number(value);
        if (Number.isFinite(n)) out[key] = n;
      }
    }
    return out;
  }

  private realmLingyun(realm: number): number {
    const rb = APP_CONFIG.unitRealmBase.lingyun;
    return Math.round(rb.base * Math.pow(rb.growth, realm - 1));
  }

  private computeFinalStats(base: Record<string, number>, affixes: HiddenAffixView[]): Record<string, number> {
    const statPct: Record<string, number> = { hp: 0, atk: 0, def: 0, spiritPower: 0 };
    const flat: Record<string, number> = {};
    for (const affix of affixes) {
      for (const [key, raw] of Object.entries(affix.effects)) {
        const n = Number(raw);
        if (!Number.isFinite(n)) continue;
        if (key === 'all_stats_pct') {
          for (const s of Object.keys(statPct)) statPct[s] += n;
          continue;
        }
        if (key.endsWith('_pct')) {
          const mapped = STAT_MAP[key.slice(0, -4)];
          if (mapped) {
            statPct[mapped] += n;
            continue;
          }
        }
        const camel = toCamel(key);
        flat[camel] = (flat[camel] ?? 0) + n;
      }
    }
    const out: Record<string, number> = {};
    for (const [stat, value] of Object.entries(base)) {
      out[stat] = Math.round(value * (1 + (statPct[stat] ?? 0) / 100));
    }
    for (const [key, value] of Object.entries(flat)) {
      out[key] = Math.round(value * 100) / 100;
    }
    return out;
  }

  private instantiate(loaded: LoadedUnit, hiddenCount?: number): UnitInstanceView {
    const unit = loaded.unit;
    const override = this.parseJson<Record<string, number> | null>(unit.base_stats, null);
    const baseStats = this.mergeBaseStats(unit.realm, override);
    const n = hiddenCount != null
      ? hiddenCount
      : this.randomRange(APP_CONFIG.unitHiddenAffixCount[0], APP_CONFIG.unitHiddenAffixCount[1]);
    const picked = this.weightedSample(loaded.pool, n);
    const hiddenAffixes: HiddenAffixView[] = picked.map((h) => ({
      code: h.code,
      name: h.name,
      effects: this.parseJson<Record<string, number>>(h.effects, {}),
    }));
    const finalStats = this.computeFinalStats(baseStats, hiddenAffixes);
    const lingyunGainPct = Number(finalStats.lingyunGain ?? 0);
    const lingyunReward = unit.gives_lingyun
      ? Math.round(this.realmLingyun(unit.realm) * (1 + lingyunGainPct / 100))
      : 0;
    return {
      code: unit.code,
      name: unit.name,
      realm: unit.realm,
      realmName: realmName(unit.realm),
      camp: unit.camp,
      givesLingyun: Boolean(unit.gives_lingyun),
      dropTable: loaded.table ? loaded.table.code : null,
      baseStats,
      hiddenAffixes,
      finalStats,
      lingyunReward,
    };
  }

  private async loadUnit(code: string): Promise<LoadedUnit | null> {
    const rows = await this.gameDb.query<UnitTemplateRow>(
      'SELECT * FROM game_unit_templates WHERE code = $1',
      [code],
    );
    const unit = rows.rows[0];
    if (!unit) return null;
    const pool = await this.gameDb.query<HiddenAffixRow>(
      'SELECT h.* FROM game_unit_hidden_pools p JOIN game_unit_hidden_affixes h ON h.id = p.hidden_affix_id WHERE p.unit_template_id = $1 ORDER BY h.id',
      [unit.id],
    );
    let table: DropTableRow | null = null;
    let entries: DropEntryRow[] = [];
    if (unit.drop_table_ref != null) {
      const tableRows = await this.gameDb.query<DropTableRow>(
        'SELECT * FROM game_drop_tables WHERE id = $1',
        [unit.drop_table_ref],
      );
      table = tableRows.rows[0] ?? null;
      if (table) {
        const entryRows = await this.gameDb.query<DropEntryRow>(
          'SELECT * FROM game_drop_entries WHERE drop_table_id = $1 ORDER BY id',
          [table.id],
        );
        entries = entryRows.rows;
      }
    }
    return { unit, pool: pool.rows, table, entries };
  }

  // ===== 图鉴 =====

  async catalog(userId: number, filters: CatalogFilters): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { error } = await this.resolveCharacter(userId);
    if (error) return error;

    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.realm != null) {
      params.push(filters.realm);
      where.push('realm = $' + params.length);
    }
    if (filters.camp) {
      params.push(filters.camp);
      where.push('camp = $' + params.length);
    }
    const whereSql = where.length > 0 ? ' WHERE ' + where.join(' AND ') : '';

    const [rows, poolRows, tableRows] = await Promise.all([
      this.gameDb.query<UnitTemplateRow>('SELECT * FROM game_unit_templates' + whereSql + ' ORDER BY realm, id', params),
      this.gameDb.query<{ unit_template_id: number; code: string }>(
        'SELECT p.unit_template_id, h.code FROM game_unit_hidden_pools p JOIN game_unit_hidden_affixes h ON h.id = p.hidden_affix_id ORDER BY h.id',
      ),
      this.gameDb.query<{ id: number; code: string }>('SELECT id, code FROM game_drop_tables'),
    ]);

    const poolByUnit = new Map<number, string[]>();
    for (const p of poolRows.rows) {
      const list = poolByUnit.get(Number(p.unit_template_id)) ?? [];
      list.push(p.code);
      poolByUnit.set(Number(p.unit_template_id), list);
    }
    const tableCodeById = new Map<number, string>(tableRows.rows.map((t) => [Number(t.id), t.code]));

    const units = rows.rows.map((u) => {
      const override = this.parseJson<Record<string, number> | null>(u.base_stats, null);
      return {
        id: u.id,
        code: u.code,
        name: u.name,
        realm: u.realm,
        realmName: realmName(u.realm),
        camp: u.camp,
        givesLingyun: Boolean(u.gives_lingyun),
        dropTable: u.drop_table_ref != null ? (tableCodeById.get(Number(u.drop_table_ref)) ?? null) : null,
        baseStats: this.mergeBaseStats(u.realm, override),
        hiddenPool: poolByUnit.get(Number(u.id)) ?? [],
        lingyunReward: u.gives_lingyun ? this.realmLingyun(u.realm) : 0,
      };
    });
    return { success: true, message: '获取单位图鉴成功', data: { total: units.length, units } };
  }

  async dropTables(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { error } = await this.resolveCharacter(userId);
    if (error) return error;
    const [tables, entries] = await Promise.all([
      this.gameDb.query<DropTableRow>('SELECT * FROM game_drop_tables ORDER BY id'),
      this.gameDb.query<DropEntryRow>('SELECT * FROM game_drop_entries ORDER BY id'),
    ]);
    const byTable = new Map<number, DropEntryRow[]>();
    for (const e of entries.rows) {
      const list = byTable.get(Number(e.drop_table_id)) ?? [];
      list.push(e);
      byTable.set(Number(e.drop_table_id), list);
    }
    const views = tables.rows.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      dropsPerKill: t.drops_per_kill,
      tierOffset: t.tier_offset,
      entries: (byTable.get(Number(t.id)) ?? []).map((e) => ({
        kind: e.kind,
        baseId: e.base_id,
        baseTier: e.base_tier,
        rarity: e.rarity,
        currencyCode: e.currency_code,
        essenceCode: e.essence_code,
        minCount: e.min_count,
        maxCount: e.max_count,
        weight: e.weight,
      })),
    }));
    return { success: true, message: '获取掉落表成功', data: { total: views.length, tables: views } };
  }

  // ===== 即时实例化（dev） =====

  async spawn(userId: number, code: string, hiddenCount?: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const guard = this.productionGuard();
    if (guard) return guard;
    const { error } = await this.resolveCharacter(userId);
    if (error) return error;
    if (hiddenCount != null && (!Number.isInteger(hiddenCount) || hiddenCount < 0 || hiddenCount > 6)) {
      return fail('INVALID_PARAM', 'hiddenCount 需为 0~6 的整数');
    }
    if (!this.rateLimiter.allow(userId, APP_CONFIG.devToolRateLimitPerMinute)) {
      return fail('RATE_LIMITED', '开发接口每分钟最多调用 ' + APP_CONFIG.devToolRateLimitPerMinute + ' 次');
    }
    const loaded = await this.loadUnit(code);
    if (!loaded) return fail('UNIT_NOT_FOUND', '单位不存在：' + code);
    const unit = this.instantiate(loaded, hiddenCount);
    return {
      success: true,
      message: '实例化成功：' + unit.name + '（' + unit.realmName + '）',
      data: { unit },
    };
  }

  // ===== 击杀结算 + 辨宝法阵（dev） =====

  private async pickBase(entry: DropEntryRow): Promise<BaseRow | null> {
    if (entry.base_id != null) {
      let base = this.baseById.get(Number(entry.base_id));
      if (!base) {
        const rows = await this.gameDb.query<BaseRow>('SELECT * FROM game_item_bases WHERE id = $1', [entry.base_id]);
        base = rows.rows[0];
        if (base) this.baseById.set(Number(base.id), base);
      }
      return base ?? null;
    }
    if (entry.base_tier != null) {
      let list = this.basesByTier.get(Number(entry.base_tier));
      if (!list) {
        const rows = await this.gameDb.query<BaseRow>('SELECT * FROM game_item_bases WHERE tier = $1', [entry.base_tier]);
        list = rows.rows;
        this.basesByTier.set(Number(entry.base_tier), list);
      }
      return this.weightedPickBy(list, (r) => r.drop_weight);
    }
    return null;
  }

  private async loadPickupRules(characterId: number): Promise<PickupRuleRow[]> {
    const own = await this.gameDb.query<PickupRuleRow>(
      'SELECT * FROM game_pickup_rules WHERE character_id = $1 AND enabled = TRUE ORDER BY priority DESC, id',
      [characterId],
    );
    if (own.rows.length > 0) return own.rows;
    const tpl = await this.gameDb.query<PickupRuleRow>(
      'SELECT * FROM game_pickup_rules WHERE character_id = 0 AND enabled = TRUE ORDER BY priority DESC, id',
    );
    return tpl.rows;
  }

  private decideLoot(item: ItemView, rules: PickupRuleRow[]): string {
    const codes = item.affixes.map((a) => a.code);
    for (const rule of rules) {
      if (item.rarity < rule.rarity_min) continue;
      if (item.tier < rule.tier_min) continue;
      const want = this.parseJson<string[]>(rule.affix_codes, []);
      if (want.length > 0 && !codes.some((c) => want.includes(c))) continue;
      return normalizeLootAction(rule.action);
    }
    return APP_CONFIG.lootFallbackAction;
  }

  private salvageLingyun(tier: number, rarity: number): number {
    return tier * APP_CONFIG.lootSalvageLingyunPerTier * (rarity + 1);
  }

  private sellSpiritStones(tier: number, rarity: number): number {
    return tier * APP_CONFIG.lootSellSpiritStonesPerTier * (rarity + 1);
  }

  /**
   * 结算核心：击杀 count 次单位，产出灵韵 + 掉落（经辨宝法阵）并落库。
   * options.itemBudget 非空时限制本次可产出物品件数（离线日上限），达到上限后不再生成物品（灵韵/通货/精华照常）。
   */
  async settleKills(
    characterId: number,
    code: string,
    count: number,
    options?: { itemBudget?: number; lingyunBonusFlat?: number; tierOffsetBonus?: number; dropDrawBonus?: number },
  ): Promise<SettleResult> {
    const loaded = await this.loadUnit(code);
    if (!loaded) return { ok: false, result: fail('UNIT_NOT_FOUND', '单位不存在：' + code) };
    if (loaded.unit.camp !== 'hostile') {
      return { ok: false, result: fail('NOT_KILLABLE', loaded.unit.name + ' 非敌对单位，无法击杀') };
    }
    const itemBudget = options?.itemBudget;
    const lingyunBonusFlat = options?.lingyunBonusFlat ?? 0;
    const tierOffsetBonus = options?.tierOffsetBonus ?? 0;
    const dropDrawBonus = options?.dropDrawBonus ?? 0;

    const rules = await this.loadPickupRules(characterId);
    const tierOffset = (loaded.table ? loaded.table.tier_offset : 0) + tierOffsetBonus;
    const dropsPerKill = (loaded.table ? loaded.table.drops_per_kill : 0) + dropDrawBonus;

    const items: ItemView[] = [];
    let kept = 0;
    let salvaged = 0;
    let sold = 0;
    let discarded = 0;
    let blockedByTier = 0;
    let itemsProduced = 0;
    let lingyunGained = 0;
    let salvageLingyunTotal = 0;
    let spiritStonesGained = 0;
    const currencies = new Map<string, number>();
    const essences = new Map<string, number>();

    for (let i = 0; i < count; i++) {
      const inst = this.instantiate(loaded, undefined);
      if (loaded.unit.gives_lingyun) lingyunGained += inst.lingyunReward;
      for (let d = 0; d < dropsPerKill; d++) {
        const entry = this.weightedPick(loaded.entries);
        if (!entry) continue;
        if (entry.kind === 'currency' && entry.currency_code) {
          const n = this.randomRange(entry.min_count, entry.max_count);
          currencies.set(entry.currency_code, (currencies.get(entry.currency_code) ?? 0) + n);
          continue;
        }
        if (entry.kind === 'essence' && entry.essence_code) {
          const n = this.randomRange(entry.min_count, entry.max_count);
          essences.set(entry.essence_code, (essences.get(entry.essence_code) ?? 0) + n);
          continue;
        }
        if (entry.kind !== 'base') continue;
        const base = await this.pickBase(entry);
        if (!base) continue;
        if (Number(base.tier) > loaded.unit.realm + tierOffset) {
          blockedByTier++;
          continue;
        }
        if (itemBudget != null && itemsProduced >= itemBudget) continue;
        const rarity = entry.rarity == null ? 0 : Number(entry.rarity);
        const gen = await this.affixService.generateItem(Number(base.id), rarity, characterId);
        if (!gen.success) continue;
        const item = (gen.data as { item: ItemView }).item;
        const action = this.decideLoot(item, rules);
        itemsProduced++;
        if (action === 'keep') {
          kept++;
          if (items.length < 50) items.push(item);
          continue;
        }
        await this.gameDb.query('DELETE FROM game_items WHERE id = $1 AND character_id = $2', [item.id, characterId]);
        if (action === 'salvage') {
          salvaged++;
          const reward = this.salvageLingyun(item.tier, item.rarity);
          salvageLingyunTotal += reward;
          lingyunGained += reward;
        } else if (action === 'sell') {
          sold++;
          spiritStonesGained += this.sellSpiritStones(item.tier, item.rarity);
        } else {
          discarded++;
        }
      }
    }

    await this.statService.recordKill(characterId, loaded.unit.code, loaded.unit.realm, count);
    lingyunGained += lingyunBonusFlat;

    for (const [currencyCode, amount] of currencies) {
      await this.gameDb.query(
        'INSERT INTO game_wallets (character_id, currency_code, amount) VALUES ($1, $2, $3) ON CONFLICT (character_id, currency_code) DO UPDATE SET amount = game_wallets.amount + EXCLUDED.amount, updated_at = CURRENT_TIMESTAMP',
        [characterId, currencyCode, amount],
      );
    }
    for (const [essenceCode, amount] of essences) {
      await this.gameDb.query(
        'INSERT INTO game_essence_inventory (character_id, essence_id, count) SELECT $1, id, $3 FROM game_essences WHERE code = $2 ON CONFLICT (character_id, essence_id) DO UPDATE SET count = game_essence_inventory.count + EXCLUDED.count, updated_at = CURRENT_TIMESTAMP',
        [characterId, essenceCode, amount],
      );
    }
    const upd = await this.userDb.query<{ lingyun: string; spirit_stones: string }>(
      'UPDATE characters SET lingyun = lingyun + $1, spirit_stones = spirit_stones + $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING lingyun, spirit_stones',
      [lingyunGained, spiritStonesGained, characterId],
    );

    const currencyView: Record<string, number> = {};
    for (const [k, v] of currencies) currencyView[k] = v;
    const essenceView: Record<string, number> = {};
    for (const [k, v] of essences) essenceView[k] = v;

    return {
      ok: true,
      data: {
        unit: { code: loaded.unit.code, name: loaded.unit.name, realm: loaded.unit.realm },
        kills: count,
        lingyunGained,
        lingyunTotal: Number(upd.rows[0] ? upd.rows[0].lingyun : 0),
        items,
        kept,
        salvaged: { count: salvaged, lingyun: salvageLingyunTotal },
        sold: { count: sold, spiritStones: spiritStonesGained },
        discarded,
        blockedByTier,
        currencies: currencyView,
        essences: essenceView,
        itemsProduced,
      },
    };
  }

  /** 击杀结算（dev）：门禁 + 参数校验 + 限流 → settleKills */
  async kill(userId: number, code: string, countInput?: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const guard = this.productionGuard();
    if (guard) return guard;
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const count = countInput == null ? 1 : countInput;
    if (!Number.isInteger(count) || count < 1 || count > APP_CONFIG.maxKillsPerRequest) {
      return fail('INVALID_PARAM', 'count 需为 1~' + APP_CONFIG.maxKillsPerRequest + ' 的整数');
    }
    if (!this.rateLimiter.allow(userId, APP_CONFIG.devToolRateLimitPerMinute)) {
      return fail('RATE_LIMITED', '开发接口每分钟最多调用 ' + APP_CONFIG.devToolRateLimitPerMinute + ' 次');
    }
    const settled = await this.settleKills(character.id, code, count);
    if (!settled.ok) return settled.result;
    return {
      success: true,
      message: '击杀结算完成：' + settled.data.unit.name + ' ×' + count,
      data: settled.data,
    };
  }
}
