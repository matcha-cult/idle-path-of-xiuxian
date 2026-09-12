/**
 * 单位 HTTP Controller（P4）
 *
 * - GET  /api/game/units         单位图鉴
 * - GET  /api/game/drop-tables   掉落表图鉴
 * - POST /api/game/unit/spawn    即时实例化（dev）
 * - POST /api/game/unit/kill     击杀结算 + 辨宝法阵（dev）
 */
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UserId } from '../../../common/decorators/user-id.decorator.js';
import { UnitService } from './unit.service.js';
import { UNIT_CAMPS } from './unit.types.js';

function toFiniteInt(value: unknown): number | undefined {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

function invalidParam(message = '参数不合法') {
  return { success: false, message, data: { code: 'INVALID_PARAM' } };
}

@Controller('game')
export class UnitController {
  constructor(private readonly unitService: UnitService) {}

  @Get('units')
  async catalog(
    @UserId() userId: number,
    @Query() query: Record<string, string | undefined>,
  ) {
    const realm = query.realm != null ? toFiniteInt(query.realm) : undefined;
    if (query.realm != null && (realm == null || realm < 1 || realm > 14)) {
      return invalidParam('realm 需为 1~14 的整数');
    }
    const camp = query.camp || undefined;
    if (camp != null && !(UNIT_CAMPS as readonly string[]).includes(camp)) {
      return invalidParam('camp 需为 hostile/neutral/friendly');
    }
    return this.unitService.catalog(userId, { realm, camp });
  }

  @Get('drop-tables')
  async dropTables(@UserId() userId: number) {
    return this.unitService.dropTables(userId);
  }

  @Post('unit/spawn')
  async spawn(@UserId() userId: number, @Body() body: { code?: unknown; hiddenCount?: unknown }) {
    if (typeof body.code !== 'string' || !body.code.trim()) return invalidParam('code 必填');
    const hiddenCount = body.hiddenCount != null ? toFiniteInt(body.hiddenCount) : undefined;
    if (body.hiddenCount != null && hiddenCount == null) return invalidParam('hiddenCount 不合法');
    return this.unitService.spawn(userId, body.code.trim(), hiddenCount);
  }

  @Post('unit/kill')
  async kill(@UserId() userId: number, @Body() body: { code?: unknown; count?: unknown }) {
    if (typeof body.code !== 'string' || !body.code.trim()) return invalidParam('code 必填');
    const count = body.count != null ? toFiniteInt(body.count) : undefined;
    if (body.count != null && count == null) return invalidParam('count 不合法');
    return this.unitService.kill(userId, body.code.trim(), count);
  }
}
