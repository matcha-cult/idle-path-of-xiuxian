/**
 * 物品服务：背包 / 装备 / 卸下 / 丢弃 / 装备栏 / 基底库 / 辨宝法阵
 *
 * - 角色归属经 CharacterService（用户库）解析，物品数据在 game 库
 * - 境界校验：物品 tier > 角色 realm 时禁止装备（TIER_TOO_HIGH）
 * - P1 丢弃为物理删除；出售/分解属 P3+
 */
import { Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../../common/config/app-config.js';
import { RateLimiterService } from '../../../../common/services/rate-limiter.service.js';
import { bigintToSafeNumber } from '../../../../common/utils/safe-bigint.js';
import { CharacterService } from '../../../character/character.service.js';
import { GameDatabaseService } from '../../../game/game-database.service.js';
import { ItemAffixService } from './item.affix.service.js';
import {
  EQUIP_SLOT_KEYS,
  ITEM_SLOT_BASE,
  type AffixEntry,
  type FailResult,
  type ItemRow,
  type ItemView,
} from './item.types.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
/** 页码上限：保证 offset = (page-1)*pageSize 仍在安全整数范围内（R11 极值兜底） */
const MAX_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / MAX_PAGE_SIZE);

/**
 * 分页参数归一（R11）：服务层自兜底，不依赖 Action 层。
 * 非 number / NaN / ±Infinity → fallback；否则 floor 后在 [min, max] 内 clamp。
 */
function normalizePageParam(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : Number.NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

interface ItemWithBase extends ItemRow {
  code: string;
  base_name: string;
  category: string;
  slot: string | null;
}

@Injectable()
export class ItemService {
  constructor(
    private readonly gameDb: GameDatabaseService,
    private readonly affixService: ItemAffixService,
    private readonly characterService: CharacterService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  private emptySlots(): Record<string, number | null> {
    return Object.fromEntries(EQUIP_SLOT_KEYS.map((k) => [k, null]));
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

  private async resolveCharacter(userId: number) {
    const character = await this.characterService.findByUserId(userId);
    if (!character) {
      return { error: fail('CHARACTER_NOT_FOUND', '尚未创建角色') };
    }
    return { character };
  }

  // ===== 开发/测试生成接口门禁（共享限流器：generate/lingyun-grant/jade-grant 共用额度） =====

  /**
   * 生成物品（开发/测试用）门禁：
   * 1. 生产环境禁用（NODE_ENV=production → FORBIDDEN）
   * 2. 单账户每分钟限次（app.config.json: generateRateLimitPerMinute）
   * 3. characterId 只允许本人角色 id 或 null（无主）；越权 → FORBIDDEN
   */
  async generateItemForUser(
    userId: number,
    baseId: number,
    rarity: number,
    characterId: number | null,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    if ((process.env.NODE_ENV ?? 'development') === 'production') {
      return fail('FORBIDDEN', '开发接口在生产环境不可用');
    }
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    let target: number | null = null;
    if (characterId != null) {
      // 归属校验先于限流：无效请求不消耗额度
      if (characterId !== character.id) {
        return fail('FORBIDDEN', '只能为本人角色生成物品');
      }
      target = character.id;
    }
    if (!this.rateLimiter.allow(userId, APP_CONFIG.devToolRateLimitPerMinute)) {
      return fail(
        'RATE_LIMITED',
        `生成接口每分钟最多调用 ${APP_CONFIG.devToolRateLimitPerMinute} 次`,
      );
    }
    return this.affixService.generateItem(baseId, rarity, target);
  }

  /** 背包列表（筛选 + 分页） */
  async inventory(
    userId: number,
    filters: { category?: string; rarity?: number; tierMin?: number; tierMax?: number; page?: number; pageSize?: number },
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;

    const page = normalizePageParam(filters.page, 1, 1, MAX_PAGE);
    const pageSize = normalizePageParam(filters.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const where: string[] = ['i.character_id = $1'];
    const params: unknown[] = [character.id];
    if (filters.category) {
      params.push(filters.category);
      where.push(`b.category = $${params.length}`);
    }
    if (filters.rarity != null) {
      params.push(filters.rarity);
      where.push(`i.rarity = $${params.length}`);
    }
    if (filters.tierMin != null) {
      params.push(filters.tierMin);
      where.push(`i.tier >= $${params.length}`);
    }
    if (filters.tierMax != null) {
      params.push(filters.tierMax);
      where.push(`i.tier <= $${params.length}`);
    }
    const whereSql = where.join(' AND ');

    const countResult = await this.gameDb.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM game_items i
       JOIN game_item_bases b ON b.id = i.base_id WHERE ${whereSql}`,
      params,
    );
    const total = bigintToSafeNumber(countResult.rows[0]?.count ?? 0, 'game_items.count');

    const offset = (page - 1) * pageSize;
    const rowsResult = await this.gameDb.query<ItemWithBase>(
      `SELECT i.id, i.character_id, i.base_id, i.rarity, i.tier, i.quality, i.affixes, i.status, i.created_at,
              b.code, b.name AS base_name, b.category, b.slot
       FROM game_items i
       JOIN game_item_bases b ON b.id = i.base_id
       WHERE ${whereSql}
       ORDER BY i.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );
    const items = await this.toViews(rowsResult.rows);
    return { success: true, message: '获取背包成功', data: { total, page, pageSize, items } };
  }

  /** 物品详情 */
  async detail(
    userId: number,
    itemId: number,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;

    const rows = await this.getItemById(itemId);
    const row = rows[0];
    if (!row) return fail('ITEM_NOT_FOUND', '物品不存在');
    if (row.character_id !== character.id) return fail('ITEM_NOT_OWNED', '物品不属于当前角色');

    const [view] = await this.toViews([row]);
    return { success: true, message: '获取物品成功', data: { item: view } };
  }

  /** 装备到指定槽位（戒指自动分配 ring1/ring2） */
  async equip(
    userId: number,
    itemId: number,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;

    const result = await this.gameDb.withTransaction(async (tx) => {
      const itemRows = await tx.query<ItemWithBase>(
        `SELECT i.id, i.character_id, i.base_id, i.rarity, i.tier, i.quality, i.affixes, i.status, i.created_at,
                b.code, b.name AS base_name, b.category, b.slot
         FROM game_items i
         JOIN game_item_bases b ON b.id = i.base_id
         WHERE i.id = $1 FOR UPDATE`,
        [itemId],
      );
      const row = itemRows.rows[0];
      if (!row) return { ok: false, result: fail('ITEM_NOT_FOUND', '物品不存在') };
      if (row.character_id !== character.id) return { ok: false, result: fail('ITEM_NOT_OWNED', '物品不属于当前角色') };
      if (row.status !== 'bag') return { ok: false, result: fail('ITEM_NOT_IN_BAG', '物品状态不可装备') };
      if (row.tier > character.realm) {
        return {
          ok: false,
          result: fail('TIER_TOO_HIGH', `当前境界 ${character.realm}，无法装备 T${row.tier} 物品`),
        };
      }

      // 装备栏首次创建走 ON CONFLICT（并发首装竞态安全），随后锁行读取
      await tx.query(
        `INSERT INTO game_equipment (character_id, slots)
         VALUES ($1, $2) ON CONFLICT (character_id) DO NOTHING`,
        [character.id, JSON.stringify(this.emptySlots())],
      );
      const equipRows = await tx.query<{ id: number; slots: string }>(
        'SELECT id, slots FROM game_equipment WHERE character_id = $1 FOR UPDATE',
        [character.id],
      );
      const equipRow = equipRows.rows[0];
      if (!equipRow) return { ok: false, result: fail('ITEM_NOT_IN_BAG', '装备栏初始化失败') };
      const equipId = Number(equipRow.id);
      let slots: Record<string, number | null>;
      try {
        slots = JSON.parse(equipRow.slots) as Record<string, number | null>;
      } catch {
        slots = this.emptySlots();
      }

      // 槽位映射：ring → ring1/ring2
      let slotKey: string;
      if (row.slot === 'ring') {
        if (slots.ring1 == null) slotKey = 'ring1';
        else if (slots.ring2 == null) slotKey = 'ring2';
        else return { ok: false, result: fail('SLOT_OCCUPIED', '两枚戒指槽位均已占用') };
      } else {
        slotKey = row.slot ?? '';
        if (!slotKey || !(slotKey in ITEM_SLOT_BASE)) {
          return { ok: false, result: fail('ITEM_NOT_IN_BAG', '物品无合法装备槽位') };
        }
        if (slots[slotKey] != null) return { ok: false, result: fail('SLOT_OCCUPIED', '槽位已占用') };
      }

      slots[slotKey] = bigintToSafeNumber(row.id, 'game_items.id');
      await tx.query(
        'UPDATE game_equipment SET slots = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(slots), equipId],
      );
      await tx.query(
        "UPDATE game_items SET status = 'equipped', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [row.id],
      );
      return { ok: true, result: { slot: slotKey, slots, name: row.base_name } };
    });

    if (!result.ok) return result.result as FailResult;
    const okResult = result.result as {
      slot: string;
      slots: Record<string, number | null>;
      name: string;
    };
    return {
      success: true,
      message: `装备成功：${okResult.name} 已佩戴至 ${okResult.slot}`,
      data: { slot: okResult.slot, slots: okResult.slots },
    };
  }

  /** 卸下 */
  async unequip(
    userId: number,
    itemId: number,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;

    return this.gameDb.withTransaction(async (tx) => {
      const itemRows = await tx.query<ItemRow & { code: string; base_name: string; category: string; slot: string | null }>(
        `SELECT i.*, b.code, b.name AS base_name, b.category, b.slot
         FROM game_items i JOIN game_item_bases b ON b.id = i.base_id
         WHERE i.id = $1 FOR UPDATE`,
        [itemId],
      );
      const row = itemRows.rows[0];
      if (!row) return fail('ITEM_NOT_FOUND', '物品不存在');
      if (row.character_id !== character.id) return fail('ITEM_NOT_OWNED', '物品不属于当前角色');

      const equipRows = await tx.query<{ id: number; slots: string }>(
        'SELECT id, slots FROM game_equipment WHERE character_id = $1 FOR UPDATE',
        [character.id],
      );
      if (!equipRows.rows[0]) return fail('ITEM_NOT_EQUIPPED', '角色未拥有装备栏记录');
      let slots: Record<string, number | null>;
      try {
        slots = JSON.parse(equipRows.rows[0].slots) as Record<string, number | null>;
      } catch {
        // 与 equip/equipment 视图对齐：slots 损坏按空栏处理 → 受控失败
        slots = this.emptySlots();
      }
      const slotKey = Object.keys(slots).find((k) => slots[k] === bigintToSafeNumber(row.id, 'game_items.id'));
      if (!slotKey) return fail('ITEM_NOT_EQUIPPED', '物品未被装备');

      slots[slotKey] = null;
      await tx.query(
        'UPDATE game_equipment SET slots = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(slots), equipRows.rows[0].id],
      );
      await tx.query(
        "UPDATE game_items SET status = 'bag', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [row.id],
      );
      return { success: true, message: `已卸下：${row.base_name}`, data: { slot: slotKey, slots } };
    });
  }

  /** 丢弃（P1 物理删除） */
  async discard(
    userId: number,
    itemId: number,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;

    return this.gameDb.withTransaction(async (tx) => {
      const itemRows = await tx.query<ItemWithBase>(
        `SELECT i.id, i.character_id, i.base_id, i.rarity, i.tier, i.quality, i.affixes, i.status, i.created_at,
                b.code, b.name AS base_name, b.category, b.slot
         FROM game_items i JOIN game_item_bases b ON b.id = i.base_id
         WHERE i.id = $1 FOR UPDATE`,
        [itemId],
      );
      const row = itemRows.rows[0];
      if (!row) return fail('ITEM_NOT_FOUND', '物品不存在');
      if (row.character_id !== character.id) return fail('ITEM_NOT_OWNED', '物品不属于当前角色');
      if (row.status === 'equipped') return fail('ITEM_NOT_IN_BAG', '已装备的物品无法丢弃，请先卸下');

      await tx.query('DELETE FROM game_items WHERE id = $1', [row.id]);
      return { success: true, message: `已丢弃：${row.base_name}`, data: { itemId: bigintToSafeNumber(row.id, 'game_items.id') } };
    });
  }

  /** 当前装备栏视图 */
  async equipment(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;

    const equipRows = await this.gameDb.query<{ slots: string }>(
      'SELECT slots FROM game_equipment WHERE character_id = $1',
      [character.id],
    );
    let slots: Record<string, number | null> = this.emptySlots();
    if (equipRows.rows[0]) {
      try {
        slots = JSON.parse(equipRows.rows[0].slots) as Record<string, number | null>;
      } catch {
        slots = this.emptySlots();
      }
    }
    const itemIds = EQUIP_SLOT_KEYS.map((k) => slots[k]).filter((v): v is number => v != null);
    const view: Record<string, { id: number; name: string; rarity: number; tier: number } | null> =
      Object.fromEntries(EQUIP_SLOT_KEYS.map((k) => [k, null]));
    let equippedCount = 0;
    if (itemIds.length > 0) {
      const rows = await this.getItemsByIds(itemIds);
      const map = new Map(rows.map((r) => [bigintToSafeNumber(r.id, 'game_items.id'), r]));
      for (const k of EQUIP_SLOT_KEYS) {
        const id = slots[k];
        if (id == null) continue;
        const row = map.get(id);
        if (!row) continue;
        view[k] = { id: bigintToSafeNumber(row.id, 'game_items.id'), name: row.base_name, rarity: row.rarity, tier: row.tier };
        equippedCount++;
      }
    }
    return { success: true, message: '获取装备栏成功', data: { slots: view, equippedCount } };
  }

  /** 基底库查询 */
  async bases(
    filters: { category?: string; tier?: number; page?: number; pageSize?: number; withPool?: number },
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    const page = normalizePageParam(filters.page, 1, 1, MAX_PAGE);
    const pageSize = normalizePageParam(filters.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.category) {
      params.push(filters.category);
      where.push(`category = $${params.length}`);
    }
    if (filters.tier != null) {
      params.push(filters.tier);
      where.push(`tier = $${params.length}`);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await this.gameDb.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM game_item_bases ${whereSql}`,
      params,
    );
    const total = bigintToSafeNumber(countResult.rows[0]?.count ?? 0, 'game_item_bases.count');

    const offset = (page - 1) * pageSize;
    const rowsResult = await this.gameDb.query<import('./item.types.js').BaseRow>(
      `SELECT * FROM game_item_bases ${whereSql} ORDER BY tier, id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );

    const baseViews: unknown[] = [];
    for (const row of rowsResult.rows) {
      const view: Record<string, unknown> = {
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        slot: row.slot,
        subType: row.sub_type,
        tier: row.tier,
        baseStats: this.tryParse(row.base_stats, null),
        rarityLimit: row.rarity_limit,
        dropWeight: row.drop_weight,
      };
      if (filters.withPool === 1) {
        view.affixPoolSummary = await this.poolSummary(row.id);
      }
      baseViews.push(view);
    }
    return { success: true, message: '获取基底库成功', data: { total, page, pageSize, bases: baseViews } };
  }

  /** 池摘要：前缀/后缀 code 列表 */
  private async poolSummary(baseId: number): Promise<{ prefix: string[]; suffix: string[] }> {
    const rows = await this.gameDb.query<{ polarity: string; code: string; tier: number }>(
      `SELECT p.polarity, a.code, a.tier
       FROM game_base_affix_pools p
       JOIN game_affixes a ON a.id = p.affix_id
       WHERE p.base_id = $1
       ORDER BY a.tier, a.code`,
      [baseId],
    );
    const prefix: string[] = [];
    const suffix: string[] = [];
    for (const row of rows.rows) {
      (row.polarity === 'prefix' ? prefix : suffix).push(row.code);
    }
    return { prefix, suffix };
  }

  // ===== 辨宝法阵（拾取规则 CRUD） =====

  async listPickupRules(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    const rows = await this.gameDb.query<RuleRow>(
      'SELECT * FROM game_pickup_rules WHERE character_id = $1 ORDER BY priority DESC, id',
      [character.id],
    );
    return { success: true, message: '获取拾取规则成功', data: { rules: rows.rows.map(toRuleView) } };
  }

  async createPickupRule(
    userId: number,
    body: RuleBody,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : '';
    if (!name) return fail('INVALID_RULE', '规则名称不能为空');

    const rows = await this.gameDb.query<RuleRow>(
      `INSERT INTO game_pickup_rules (character_id, name, rarity_min, tier_min, affix_codes, action, enabled, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [character.id, name, clampInt(body.rarityMin, 0, 3, 0), clampInt(body.tierMin, 1, 14, 1),
        JSON.stringify(normalizeCodes(body.affixCodes)),
        normalizeAction(body.action), body.enabled !== false, clampInt(body.priority, 0, 1000, 100)],
    );
    return { success: true, message: '创建规则成功', data: { rule: toRuleView(rows.rows[0]) } };
  }

  async updatePickupRule(
    userId: number,
    ruleId: number,
    body: RuleBody,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    const exist = await this.gameDb.query<RuleRow>(
      'SELECT * FROM game_pickup_rules WHERE id = $1',
      [ruleId],
    );
    const prev = exist.rows[0];
    if (!prev) return fail('PICKUP_RULE_NOT_FOUND', '规则不存在');
    if (Number(prev.character_id) !== character.id) return fail('PICKUP_RULE_NOT_FOUND', '规则不存在');

    // 部分更新：仅覆盖请求中提供的字段，其余沿用原值
    const nextName =
      typeof body.name === 'string' && body.name.trim() ? body.name.trim() : prev.name;
    const nextRarityMin = body.rarityMin != null ? clampInt(body.rarityMin, 0, 3, prev.rarity_min) : prev.rarity_min;
    const nextTierMin = body.tierMin != null ? clampInt(body.tierMin, 1, 14, prev.tier_min) : prev.tier_min;
    const nextAffixCodes = body.affixCodes !== undefined ? normalizeCodes(body.affixCodes) : safeParse<string[]>(prev.affix_codes, []);
    const nextAction = body.action !== undefined ? normalizeAction(body.action) : prev.action;
    const nextEnabled = body.enabled !== undefined ? body.enabled !== false : Boolean(prev.enabled);
    const nextPriority = body.priority != null ? clampInt(body.priority, 0, 1000, prev.priority) : prev.priority;

    const rows = await this.gameDb.query<RuleRow>(
      `UPDATE game_pickup_rules
       SET name = $1, rarity_min = $2, tier_min = $3, affix_codes = $4, action = $5, enabled = $6, priority = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING *`,
      [nextName, nextRarityMin, nextTierMin, JSON.stringify(nextAffixCodes),
        nextAction, nextEnabled, nextPriority, ruleId],
    );
    return { success: true, message: '更新规则成功', data: { rule: toRuleView(rows.rows[0]) } };
  }

  async deletePickupRule(userId: number, ruleId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    const exist = await this.gameDb.query<{ id: number; character_id: number }>(
      'SELECT id, character_id FROM game_pickup_rules WHERE id = $1',
      [ruleId],
    );
    if (!exist.rows[0] || Number(exist.rows[0].character_id) !== character.id) {
      return fail('PICKUP_RULE_NOT_FOUND', '规则不存在');
    }
    await this.gameDb.query('DELETE FROM game_pickup_rules WHERE id = $1', [ruleId]);
    return { success: true, message: '删除规则成功', data: { ruleId } };
  }

  // ===== 内部工具 =====

  private async getItemById(id: number): Promise<ItemWithBase[]> {
    const rows = await this.gameDb.query<ItemWithBase>(
      `SELECT i.id, i.character_id, i.base_id, i.rarity, i.tier, i.quality, i.affixes, i.status, i.created_at,
              b.code, b.name AS base_name, b.category, b.slot
       FROM game_items i JOIN game_item_bases b ON b.id = i.base_id
       WHERE i.id = $1`,
      [id],
    );
    return rows.rows;
  }

  private async getItemsByIds(ids: number[]): Promise<ItemWithBase[]> {
    const rows = await this.gameDb.query<ItemWithBase>(
      `SELECT i.id, i.character_id, i.base_id, i.rarity, i.tier, i.quality, i.affixes, i.status, i.created_at,
              b.code, b.name AS base_name, b.category, b.slot
       FROM game_items i JOIN game_item_bases b ON b.id = i.base_id
       WHERE i.id = ANY($1::bigint[])`,
      [ids],
    );
    return rows.rows;
  }

  private async toViews(rows: ItemWithBase[]): Promise<ItemView[]> {
    // M5：批量渲染——全部行的 affixId 汇总后只查一次 game_affixes（消除 N+1）
    return this.affixService.renderItems(
      rows.map((row) => ({
        id: bigintToSafeNumber(row.id, 'game_items.id'),
        baseId: Number(row.base_id),
        baseCode: row.code,
        name: row.base_name,
        category: row.category,
        slot: row.slot,
        rarity: Number(row.rarity),
        tier: Number(row.tier),
        quality: Number(row.quality),
        status: row.status,
        entries: this.parseEntries(row.affixes),
        createdAt: row.created_at,
      })),
    );
  }

  private tryParse<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
}

// ===== 辨宝法阵辅助类型与工具 =====

interface RuleRow {
  id: number;
  character_id: number;
  name: string;
  rarity_min: number;
  tier_min: number;
  affix_codes: string | null;
  action: string;
  enabled: boolean;
  priority: number;
  created_at: string | Date;
  updated_at: string | Date;
}

interface RuleBody {
  name?: unknown;
  rarityMin?: unknown;
  tierMin?: unknown;
  affixCodes?: unknown;
  action?: unknown;
  enabled?: unknown;
  priority?: unknown;
}

function toRuleView(row: RuleRow) {
  return {
    id: row.id,
    characterId: row.character_id,
    name: row.name,
    rarityMin: row.rarity_min,
    tierMin: row.tier_min,
    affixCodes: safeParse<string[]>(row.affix_codes, []),
    action: row.action,
    enabled: Boolean(row.enabled),
    priority: row.priority,
  };
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeAction(value: unknown): string {
  return value === 'salvage' || value === 'sell' || value === 'discard' || value === 'keep'
    ? value
    : 'keep';
}

function normalizeCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').slice(0, 50);
}

function fail(code: string, message: string): FailResult {
  return { success: false, message, data: { code } };
}
