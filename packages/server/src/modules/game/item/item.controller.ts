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
 * - POST   /api/game/item/generate（开发/测试）
 * - GET/POST/PUT/DELETE /api/game/pickup-rules
 *
 * 全部需要 JWT 认证（全局 Guard 默认拦截）。
 */
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { UserId } from '../../../common/decorators/user-id.decorator.js';
import { ItemService } from './item.service.js';
import { ItemAffixService } from './item.affix.service.js';

function toInt(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

@Controller('game')
export class ItemController {
  constructor(
    private readonly itemService: ItemService,
    private readonly affixService: ItemAffixService,
  ) {}

  @Get('inventory')
  async inventory(
    @UserId() userId: number,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.itemService.inventory(userId, {
      category: query.category || undefined,
      rarity: query.rarity != null ? toInt(query.rarity, NaN) : undefined,
      tierMin: query.tierMin != null ? toInt(query.tierMin, NaN) : undefined,
      tierMax: query.tierMax != null ? toInt(query.tierMax, NaN) : undefined,
      page: query.page != null ? toInt(query.page, 1) : undefined,
      pageSize: query.pageSize != null ? toInt(query.pageSize, 20) : undefined,
    });
  }

  @Get('inventory/:id')
  async detail(@UserId() userId: number, @Param('id') id: string) {
    return this.itemService.detail(userId, toInt(id, NaN));
  }

  @Post('item/equip')
  async equip(@UserId() userId: number, @Body() body: { itemId?: unknown }) {
    return this.itemService.equip(userId, toInt(body.itemId, NaN));
  }

  @Post('item/unequip')
  async unequip(@UserId() userId: number, @Body() body: { itemId?: unknown }) {
    return this.itemService.unequip(userId, toInt(body.itemId, NaN));
  }

  @Post('item/discard')
  async discard(@UserId() userId: number, @Body() body: { itemId?: unknown }) {
    return this.itemService.discard(userId, toInt(body.itemId, NaN));
  }

  @Get('equipment')
  async equipment(@UserId() userId: number) {
    return this.itemService.equipment(userId);
  }

  @Get('item/bases')
  async bases(@Query() query: Record<string, string | undefined>) {
    return this.itemService.bases({
      category: query.category || undefined,
      tier: query.tier != null ? toInt(query.tier, NaN) : undefined,
      page: query.page != null ? toInt(query.page, 1) : undefined,
      pageSize: query.pageSize != null ? toInt(query.pageSize, 20) : undefined,
      withPool: query.withPool === '1' ? 1 : 0,
    });
  }

  // 开发/测试接口：GET（浏览器直访）+ POST 均可
  @Get('item/generate')
  async generateByGet(
    @Query() query: Record<string, string | undefined>,
  ): Promise<unknown> {
    return this.generateInner(query.baseId, query.rarity, query.characterId);
  }

  @Post('item/generate')
  async generate(@Body() body: { baseId?: unknown; rarity?: unknown; characterId?: unknown }) {
    return this.generateInner(body.baseId, body.rarity, body.characterId);
  }

  private async generateInner(
    baseIdRaw: unknown,
    rarityRaw: unknown,
    characterIdRaw: unknown,
  ): Promise<unknown> {
    const baseId = toInt(baseIdRaw, NaN);
    const rarity = toInt(rarityRaw, NaN);
    if (!Number.isFinite(baseId) || !Number.isFinite(rarity)) {
      return { success: false, message: 'baseId 与 rarity 必填', data: { code: 'INVALID_PARAM' } };
    }
    const characterId =
      characterIdRaw != null && Number.isFinite(toInt(characterIdRaw, NaN))
        ? toInt(characterIdRaw, NaN)
        : null;
    return this.affixService.generateItem(baseId, rarity, characterId);
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
    return this.itemService.updatePickupRule(userId, toInt(id, NaN), {
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
    return this.itemService.deletePickupRule(userId, toInt(id, NaN));
  }
}
