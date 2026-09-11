/**
 * 物品 HTTP Controller（NestJS 风格）
 *
 * - GET    /api/game/inventory
 * - GET    /api/game/inventory/:id
 * - POST   /api/game/item/equip
 * - POST   /api/game/item/unequip
 * - POST   /api/game/item/discard
 * - GET    /api/game/equipment
 * - GET    /api/game/item/bases
 * - POST   /api/game/item/generate（开发/测试；生产禁用；仅限本人角色或 null；限流）
 * - GET/POST/PUT/DELETE /api/game/pickup-rules
 *
 * 全部需要 JWT 认证（全局 Guard 默认拦截）。
 */
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { UserId } from '../../../common/decorators/user-id.decorator.js';
import { ItemService } from './item.service.js';

/** 字符串/数字转有限整数；非法/缺失 → undefined */
function toFiniteInt(value: unknown): number | undefined {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

function invalidParam(message = '参数不合法') {
  return { success: false, message, data: { code: 'INVALID_PARAM' } };
}

@Controller('game')
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @Get('inventory')
  async inventory(
    @UserId() userId: number,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.itemService.inventory(userId, {
      category: query.category || undefined,
      rarity: query.rarity != null ? toFiniteInt(query.rarity) : undefined,
      tierMin: query.tierMin != null ? toFiniteInt(query.tierMin) : undefined,
      tierMax: query.tierMax != null ? toFiniteInt(query.tierMax) : undefined,
      page: toFiniteInt(query.page) ?? 1,
      pageSize: toFiniteInt(query.pageSize) ?? 20,
    });
  }

  @Get('inventory/:id')
  async detail(@UserId() userId: number, @Param('id') id: string) {
    const itemId = toFiniteInt(id);
    if (itemId == null) return invalidParam('物品 id 不合法');
    return this.itemService.detail(userId, itemId);
  }

  @Post('item/equip')
  async equip(@UserId() userId: number, @Body() body: { itemId?: unknown }) {
    const itemId = toFiniteInt(body.itemId);
    if (itemId == null) return invalidParam('itemId 不合法');
    return this.itemService.equip(userId, itemId);
  }

  @Post('item/unequip')
  async unequip(@UserId() userId: number, @Body() body: { itemId?: unknown }) {
    const itemId = toFiniteInt(body.itemId);
    if (itemId == null) return invalidParam('itemId 不合法');
    return this.itemService.unequip(userId, itemId);
  }

  @Post('item/discard')
  async discard(@UserId() userId: number, @Body() body: { itemId?: unknown }) {
    const itemId = toFiniteInt(body.itemId);
    if (itemId == null) return invalidParam('itemId 不合法');
    return this.itemService.discard(userId, itemId);
  }

  @Get('equipment')
  async equipment(@UserId() userId: number) {
    return this.itemService.equipment(userId);
  }

  @Get('item/bases')
  async bases(@Query() query: Record<string, string | undefined>) {
    return this.itemService.bases({
      category: query.category || undefined,
      tier: query.tier != null ? toFiniteInt(query.tier) : undefined,
      page: toFiniteInt(query.page) ?? 1,
      pageSize: toFiniteInt(query.pageSize) ?? 20,
      withPool: query.withPool === '1' ? 1 : 0,
    });
  }

  /**
   * 开发/测试生成物品（仅 POST）。
   * 门禁见 ItemService.generateItemForUser：生产禁用 + 归属校验 + 单账户限流。
   */
  @Post('item/generate')
  async generate(@UserId() userId: number, @Body() body: { baseId?: unknown; rarity?: unknown; characterId?: unknown }) {
    const baseId = toFiniteInt(body.baseId);
    const rarity = toFiniteInt(body.rarity);
    if (baseId == null || rarity == null) {
      return invalidParam('baseId 与 rarity 必填且为整数');
    }
    const characterId = body.characterId != null ? (toFiniteInt(body.characterId) ?? null) : null;
    return this.itemService.generateItemForUser(userId, baseId, rarity, characterId);
  }

  @Get('pickup-rules')
  async listPickupRules(@UserId() userId: number) {
    return this.itemService.listPickupRules(userId);
  }

  @Post('pickup-rules')
  async createPickupRule(@UserId() userId: number, @Body() body: Record<string, unknown>) {
    return this.itemService.createPickupRule(userId, {
      name: body.name,
      rarityMin: body.rarityMin,
      tierMin: body.tierMin,
      affixCodes: body.affixCodes,
      action: body.action,
      enabled: body.enabled,
      priority: body.priority,
    });
  }

  @Put('pickup-rules/:id')
  async updatePickupRule(
    @UserId() userId: number,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const ruleId = toFiniteInt(id);
    if (ruleId == null) return invalidParam('规则 id 不合法');
    return this.itemService.updatePickupRule(userId, ruleId, {
      name: body.name,
      rarityMin: body.rarityMin,
      tierMin: body.tierMin,
      affixCodes: body.affixCodes,
      action: body.action,
      enabled: body.enabled,
      priority: body.priority,
    });
  }

  @Delete('pickup-rules/:id')
  async deletePickupRule(@UserId() userId: number, @Param('id') id: string) {
    const ruleId = toFiniteInt(id);
    if (ruleId == null) return invalidParam('规则 id 不合法');
    return this.itemService.deletePickupRule(userId, ruleId);
  }
}
