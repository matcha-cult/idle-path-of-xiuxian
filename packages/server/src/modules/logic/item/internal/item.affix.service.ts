/**
 * 铭文生成与渲染服务（物品生成核心算法）
 *
 * 规则（v2 设计 + P1 计划 §5.6）：
 * - 底材 T 阶决定可 roll 词缀窗口 [max(1, baseTier - N), baseTier]，N 可配置（AFFIX_TIER_WINDOW，默认 4）
 * - 词缀池：底材经 game_base_affix_pools 挂载的前缀/后缀池；天定词缀（is_fractured）不参与 roll
 * - 稀有度 → 词条数：凡品 0 / 灵品 1~2（前≤1 后≤1）/ 宝品 3~6（前≤3 后≤3）/ 传奇 = 固定词缀
 * - 加权不放回抽样；同一词缀族（同 code 前缀）不重复出现
 * - 数值 roll：value = uniform(minPerTier × t, maxPerTier × t)，按 decimals 取整
 */
import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { bigintToSafeNumber } from '../../../../common/utils/safe-bigint.js';
import { GameDatabaseService } from '../../../game/game-database.service.js';
import {
  EFFECT_LABELS,
  PERCENT_KEYS,
  type AffixEntry,
  type AffixRow,
  type BaseRow,
  type FailResult,
  RARITY_NAMES,
} from './item.types.js';

// 词缀 roll 窗口 N：非法值回退 4 并告警（启动期校验，防 NaN 进 SQL）
const rawWindow = Number(process.env.AFFIX_TIER_WINDOW);
const AFFIX_TIER_WINDOW =
  Number.isInteger(rawWindow) && rawWindow >= 0 && Number.isFinite(rawWindow) ? rawWindow : 4;
if (process.env.AFFIX_TIER_WINDOW != null && AFFIX_TIER_WINDOW !== rawWindow) {
  console.warn(
    `[item] AFFIX_TIER_WINDOW 非法（${process.env.AFFIX_TIER_WINDOW}），已回退为 ${AFFIX_TIER_WINDOW}`,
  );
}

interface ValueFunc {
  key: string;
  minPerTier: number;
  maxPerTier: number;
  decimals?: number;
}

@Injectable()
export class ItemAffixService {
  constructor(private readonly gameDb: GameDatabaseService) {}

  /** int 闭区间随机 */
  private randomInt(min: number, max: number): number {
    return min + randomInt(max - min + 1);
  }

  private parseJson<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  /** 词缀族：code 去掉尾部 _数字 */
  private familyOf(code: string): string {
    return code.replace(/_\d+$/, '');
  }

  private formatValue(value: number, percent: boolean): string {
    const n = Number.isInteger(value) ? value : Number(value.toFixed(1));
    return `${n}${percent ? '%' : ''}`;
  }

  /** 加权抽取一条词缀 */
  private weightedPick(rows: AffixRow[]): AffixRow {
    const totalWeight = rows.reduce((sum, r) => sum + (r.weight > 0 ? r.weight : 1), 0);
    let r = Math.random() * totalWeight;
    for (const row of rows) {
      r -= row.weight > 0 ? row.weight : 1;
      if (r < 0) return row;
    }
    return rows[rows.length - 1];
  }

  /** 从池中加权不放回抽取 k 条（同族不重复） */
  private sampleAffixes(pool: AffixRow[], k: number): AffixRow[] {
    const picked: AffixRow[] = [];
    let candidates = [...pool];
    for (let i = 0; i < k && candidates.length > 0; i++) {
      const row = this.weightedPick(candidates);
      picked.push(row);
      const family = this.familyOf(row.code);
      candidates = candidates.filter((c) => this.familyOf(c.code) !== family);
    }
    return picked;
  }

  /** 按 base、极性、T 阶窗口查询可 roll 池 */
  private async queryPool(
    baseId: number,
    polarity: 'prefix' | 'suffix',
    tierMin: number,
    tierMax: number,
  ): Promise<AffixRow[]> {
    const result = await this.gameDb.query<AffixRow>(
      `SELECT a.id, a.code, a.name, a.polarity, a.tier, a.effects, a.value_func, a.weight, a.is_fractured
       FROM game_base_affix_pools p
       JOIN game_affixes a ON a.id = p.affix_id
       WHERE p.base_id = $1 AND p.polarity = $2
         AND a.tier >= $3 AND a.tier <= $4
         AND a.is_fractured = FALSE`,
      [baseId, polarity, tierMin, tierMax],
    );
    return result.rows;
  }

  /** roll 一条可 roll 词缀 → 固化条目 */
  private rollEntry(row: AffixRow): AffixEntry {
    const vf = this.parseJson<ValueFunc | null>(row.value_func, null);
    let value: number | null = null;
    let key: string | null = null;
    if (vf && vf.key) {
      const min = vf.minPerTier * row.tier;
      const max = vf.maxPerTier * row.tier;
      const rawValue = min + Math.random() * (max - min);
      const decimals = vf.decimals ?? 0;
      value = Number(rawValue.toFixed(decimals));
      key = vf.key;
    }
    return {
      affixId: row.id,
      value,
      polarity: row.polarity as AffixEntry['polarity'],
      key,
    };
  }

  /** 生成物品（落库） */
  async generateItem(
    baseId: number,
    rarity: number,
    characterId: number | null = null,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    const baseResult = await this.gameDb.query<BaseRow>(
      'SELECT * FROM game_item_bases WHERE id = $1',
      [baseId],
    );
    const base = baseResult.rows[0];
    if (!base) {
      return fail('BASE_NOT_FOUND', '物品基底不存在');
    }
    if (!Number.isInteger(rarity) || rarity < 0 || rarity > 3) {
      return fail('INVALID_PARAM', 'rarity 必须在 0~3 之间');
    }
    if (Number(rarity) > base.rarity_limit) {
      return fail('RARITY_EXCEEDS_LIMIT', `超出基底稀有度上限（最高${RARITY_NAMES[base.rarity_limit]}）`);
    }

    // 基底词缀（固定复制，不 roll）
    const implicitCodes = this.parseJson<string[]>(base.implicit_affixes, []);
    const entries: AffixEntry[] = [];
    if (implicitCodes.length > 0) {
      const fixed = await this.findAffixesByCodes(implicitCodes);
      for (const row of fixed) {
        entries.push({ affixId: row.id, value: null, polarity: 'base', key: null });
      }
    }

    if (rarity === 3) {
      // 传奇：固定词缀（无 roll）
      const uniqueCodes = this.parseJson<string[]>(base.unique_affixes, []);
      const legRows = await this.findAffixesByCodes(uniqueCodes);
      for (const row of legRows) {
        entries.push({
          affixId: row.id,
          value: null,
          polarity: row.polarity === 'base' ? 'base' : (row.polarity as 'prefix' | 'suffix'),
          key: null,
        });
      }
    } else if (rarity === 1) {
      // 灵品：1~2 条（前≤1 后≤1）
      const total = this.randomInt(1, 2);
      const { prefixCount, suffixCount } = this.allocCounts(total, 1, 1);
      await this.rollInto(base, entries, prefixCount, suffixCount);
    } else if (rarity === 2) {
      // 宝品：3~6 条（前≤3 后≤3）
      const total = this.randomInt(3, 6);
      const { prefixCount, suffixCount } = this.allocCounts(total, 3, 3);
      await this.rollInto(base, entries, prefixCount, suffixCount);
    }
    // 凡品：0 条，仅基底词缀

    const inserted = await this.gameDb.query<{ id: string }>(
      `INSERT INTO game_items (character_id, base_id, rarity, tier, affixes, status)
       VALUES ($1, $2, $3, $4, $5, 'bag')
       RETURNING id`,
      [characterId, base.id, rarity, base.tier, JSON.stringify(entries)],
    );
    const itemId = bigintToSafeNumber(inserted.rows[0].id, 'game_items.id');

    const view = await this.renderItem(itemId, base.id, base.code, base.name, base.category, base.slot, rarity, base.tier, 0, 'bag', entries);
    return {
      success: true,
      message: `生成成功：${base.name}（${RARITY_NAMES[rarity]}）`,
      data: { item: view },
    };
  }

  /**
   * 词条数分配：
   * 灵品：总 1~2，前≤1、后≤1；总=2 → 前1后1；总=1 → 随机一侧
   * 宝品：总 3~6，前≤3、后≤3 → prefixCount ∈ [max(0,total-3), min(3,total)]
   */
  private allocCounts(
    total: number,
    maxPrefix: number,
    maxSuffix: number,
  ): { prefixCount: number; suffixCount: number } {
    if (total === 1) {
      return Math.random() < 0.5 ? { prefixCount: 1, suffixCount: 0 } : { prefixCount: 0, suffixCount: 1 };
    }
    const lo = Math.max(0, total - maxSuffix);
    const hi = Math.min(maxPrefix, total);
    let prefixCount = lo;
    if (hi > lo) {
      prefixCount = this.randomInt(lo, hi);
    }
    return { prefixCount, suffixCount: total - prefixCount };
  }

  /** 生成前后缀并追加到 entries（前缀在前、后缀在后） */
  private async rollInto(
    base: BaseRow,
    entries: AffixEntry[],
    prefixCount: number,
    suffixCount: number,
  ): Promise<void> {
    const tierMin = Math.max(1, base.tier - AFFIX_TIER_WINDOW);
    const tierMax = base.tier;

    if (prefixCount > 0) {
      const pool = await this.queryPool(base.id, 'prefix', tierMin, tierMax);
      for (const row of this.sampleAffixes(pool, prefixCount)) {
        entries.push(this.rollEntry(row));
      }
    }
    if (suffixCount > 0) {
      const pool = await this.queryPool(base.id, 'suffix', tierMin, tierMax);
      for (const row of this.sampleAffixes(pool, suffixCount)) {
        entries.push(this.rollEntry(row));
      }
    }
  }

  private async findAffixesByCodes(codes: string[]): Promise<AffixRow[]> {
    if (codes.length === 0) return [];
    const result = await this.gameDb.query<AffixRow>(
      `SELECT id, code, name, polarity, tier, effects, value_func, weight, is_fractured
       FROM game_affixes WHERE code = ANY($1::text[])`,
      [codes],
    );
    return result.rows;
  }

  /**
   * P3 炼器复用：按数量 roll 前后缀条目（调用方负责品阶/窗口检查与基底拼接）。
   */
  async rollRollableEntries(
    base: BaseRow,
    prefixCount: number,
    suffixCount: number,
  ): Promise<AffixEntry[]> {
    const entries: AffixEntry[] = [];
    await this.rollInto(base, entries, prefixCount, suffixCount);
    return entries;
  }

  /**
   * P3 炼器复用：重 roll 各条目数值（种类与数量不变）。
   * 基底（key=null）与天定（is_fractured）条目原样保留。
   */
  async rerollEntryValues(entries: AffixEntry[]): Promise<AffixEntry[]> {
    const rollableIds = entries
      .filter((e) => e.key != null && e.value != null)
      .map((e) => e.affixId);
    const rows = await this.findAffixesByIds(rollableIds);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return entries.map((e) => {
      if (e.key == null) return e;
      const row = byId.get(e.affixId);
      if (!row || row.is_fractured) return e;
      return this.rollEntry(row);
    });
  }

  /** P3 炼器复用：按底材 T 阶窗口查询某极性全池（权重含 tier 过滤/is_fractured 排除） */
  async queryRollPoolFor(base: BaseRow, polarity: 'prefix' | 'suffix'): Promise<AffixRow[]> {
    const tierMin = Math.max(1, base.tier - AFFIX_TIER_WINDOW);
    return this.queryPool(base.id, polarity, tierMin, base.tier);
  }

  /** P3 炼器复用：从给定行集加权不放回抽 k 条（同族唯一） */
  samplePoolRows(rows: AffixRow[], k: number): AffixRow[] {
    return this.sampleAffixes(rows, k);
  }

  /** P3 炼器复用：从给定行集权重抽 1 条并 roll 为条目 */
  rollOneFromRows(rows: AffixRow[]): AffixEntry | null {
    if (rows.length === 0) return null;
    return this.rollEntry(this.weightedPick(rows));
  }

  /** P3 炼器复用：把指定行 roll 为条目 */
  rollRow(row: AffixRow): AffixEntry {
    return this.rollEntry(row);
  }

  /**
   * P3 炼器复用：词条数分配（灵品 前≤1 后≤1 / 宝品 前≤3 后≤3）。
   */
  allocCountsFor(
    total: number,
    maxPrefix: number,
    maxSuffix: number,
  ): { prefixCount: number; suffixCount: number } {
    return this.allocCounts(total, maxPrefix, maxSuffix);
  }

  /** 批量读取词缀定义 */
  async findAffixesByIds(ids: number[]): Promise<AffixRow[]> {
    if (ids.length === 0) return [];
    const result = await this.gameDb.query<AffixRow>(
      `SELECT id, code, name, polarity, tier, effects, value_func, weight, is_fractured
       FROM game_affixes WHERE id = ANY($1::int[])`,
      [ids],
    );
    return result.rows;
  }

  /** 渲染条目列表为文本（基底在前，随后前缀、后缀，同生成顺序） */
  renderAffixTexts(entries: AffixEntry[], affixById: Map<number, AffixRow>): string[] {
    const texts: string[] = [];
    for (const entry of entries) {
      const row = affixById.get(entry.affixId);
      if (!row) continue;
      const fracturedMark = entry.fractured || row.is_fractured ? '·天定' : '';
      if (entry.key && entry.value != null) {
        const percent = PERCENT_KEYS.has(entry.key);
        texts.push(
          `${row.name}${fracturedMark}${row.tier > 0 ? ` T${row.tier}` : ''}：${EFFECT_LABELS[entry.key] ?? entry.key} +${this.formatValue(entry.value, percent)}`,
        );
      } else {
        // 基底/固定词缀：取词缀定义 effects
        const effects = this.parseJson<Record<string, number>>(row.effects, {});
        const parts = Object.entries(effects).map(([k, v]) => {
          const percent = PERCENT_KEYS.has(k);
          return `${EFFECT_LABELS[k] ?? k} +${this.formatValue(v, percent)}`;
        });
        const tag = row.polarity === 'base' ? '基底' : '固定';
        texts.push(
          parts.length > 0
            ? `${row.name}${fracturedMark}（${tag}）：${parts.join('，')}`
            : `${row.name}${fracturedMark}（${tag}）`,
        );
      }
    }
    return texts;
  }

  /** 组装 ItemView（单条：内部复用批量实现，保持既有调用方签名不变） */
  async renderItem(
    id: number,
    baseId: number,
    baseCode: string,
    name: string,
    category: string,
    slot: string | null,
    rarity: number,
    tier: number,
    quality: number,
    status: string,
    entries: AffixEntry[],
    createdAt?: string | Date,
  ): Promise<import('./item.types.js').ItemView> {
    const [view] = await this.renderItems([
      { id, baseId, baseCode, name, category, slot, rarity, tier, quality, status, entries, createdAt },
    ]);
    return view;
  }

  /**
   * 批量组装 ItemView（M5：消除背包列表的 N+1）。
   *
   * 逐条 renderItem 会对每条物品各发一次 `game_affixes` 查询（N 条 → N 次 SQL）；
   * 本方法先把全部条目的 affixId 去重汇总，只查一次词缀定义，再按 Map 分发渲染。
   * 边界：空输入不查库直接返回 []；全部条目无词缀时 findAffixesByIds([]) 亦不查库。
   */
  async renderItems(
    inputs: RenderItemInput[],
  ): Promise<Array<import('./item.types.js').ItemView>> {
    if (inputs.length === 0) return [];
    const affixIds = new Set<number>();
    for (const input of inputs) {
      for (const entry of input.entries) affixIds.add(entry.affixId);
    }
    const rows = await this.findAffixesByIds([...affixIds]);
    const affixById = new Map(rows.map((r) => [r.id, r]));
    return inputs.map((input) => this.buildView(input, affixById));
  }

  /** 单条渲染（纯内存，不再触达 DB） */
  private buildView(
    input: RenderItemInput,
    affixById: Map<number, AffixRow>,
  ): import('./item.types.js').ItemView {
    const { id, baseId, baseCode, name, category, slot, rarity, tier, quality, status, entries, createdAt } = input;
    return {
      id,
      baseId,
      baseCode,
      name,
      category,
      slot,
      rarity,
      rarityName: RARITY_NAMES[rarity] ?? '未知',
      tier,
      quality,
      status,
      affixTexts: this.renderAffixTexts(entries, affixById),
      affixes: entries.map((e) => {
        const row = affixById.get(e.affixId);
        return { ...e, code: row?.code ?? '', name: row?.name ?? '', tier: row?.tier ?? 0 };
      }),
      ...(createdAt != null ? { createdAt } : {}),
    };
  }
}

/** 批量渲染入参（与 renderItem 位置参数一一对应） */
export interface RenderItemInput {
  id: number;
  baseId: number;
  baseCode: string;
  name: string;
  category: string;
  slot: string | null;
  rarity: number;
  tier: number;
  quality: number;
  status: string;
  entries: AffixEntry[];
  createdAt?: string | Date;
}

function fail(code: string, message: string): FailResult {
  return { success: false, message, data: { code } };
}
