/**
 * 通货与炼器 HTTP Controller
 * - GET  /api/game/currencies      通货图鉴
 * - POST /api/game/currency/grant  开发注入通货
 * - POST /api/game/item/craft      炼器七操作
 */
import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserId } from '../../../common/decorators/user-id.decorator.js';
import { CraftService } from './craft.service.js';
import { CurrencyService } from './currency.service.js';

function toFiniteInt(value: unknown): number | undefined {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

function invalidParam(message = '参数不合法') {
  return { success: false, message, data: { code: 'INVALID_PARAM' } };
}

@Controller('game')
export class CurrencyController {
  constructor(
    private readonly currencyService: CurrencyService,
    private readonly craftService: CraftService,
  ) {}

  @Get('currencies')
  async catalog(@UserId() userId: number) {
    return this.currencyService.catalog(userId);
  }

  @Post('currency/grant')
  async grant(@UserId() userId: number, @Body() body: { code?: unknown; count?: unknown }) {
    if (typeof body.code !== 'string' || !body.code.trim()) return invalidParam('code 必填');
    const count = toFiniteInt(body.count);
    if (count == null) return invalidParam('count 不合法');
    return this.currencyService.grant(userId, body.code.trim(), count);
  }

  @Post('item/craft')
  async craft(
    @UserId() userId: number,
    @Body() body: { itemId?: unknown; op?: unknown; essenceCode?: unknown; targetCode?: unknown },
  ) {
    const itemId = toFiniteInt(body.itemId);
    if (itemId == null) return invalidParam('itemId 不合法');
    if (typeof body.op !== 'string' || !body.op.trim()) return invalidParam('op 必填');
    const extraCode =
      typeof body.essenceCode === 'string' && body.essenceCode.trim()
        ? body.essenceCode.trim()
        : typeof body.targetCode === 'string' && body.targetCode.trim()
          ? body.targetCode.trim()
          : undefined;
    return this.craftService.craft(userId, itemId, body.op.trim(), extraCode);
  }

  @Get('essences')
  async catalogEssences(@UserId() userId: number) {
    return this.currencyService.catalogEssences(userId);
  }

  @Post('essence/grant')
  async grantEssence(@UserId() userId: number, @Body() body: { code?: unknown; count?: unknown }) {
    if (typeof body.code !== 'string' || !body.code.trim()) return invalidParam('code 必填');
    const count = toFiniteInt(body.count);
    if (count == null) return invalidParam('count 不合法');
    return this.currencyService.grantEssence(userId, body.code.trim(), count);
  }
}
