/**
 * 离线收益 HTTP Controller（P4.2）
 *
 * - GET  /api/game/idle/status   待结算状态
 * - POST /api/game/idle/settle   离线结算（hours 覆盖仅开发环境）
 */
import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserId } from '../../../common/decorators/user-id.decorator.js';
import { IdleService } from './idle.service.js';

function invalidParam(message = '参数不合法') {
  return { success: false, message, data: { code: 'INVALID_PARAM' } };
}

@Controller('game')
export class IdleController {
  constructor(private readonly idleService: IdleService) {}

  @Get('idle/status')
  async status(@UserId() userId: number) {
    return this.idleService.status(userId);
  }

  @Post('idle/settle')
  async settle(@UserId() userId: number, @Body() body: { unitCode?: unknown; hours?: unknown }) {
    let unitCode: string | undefined;
    if (body.unitCode != null) {
      if (typeof body.unitCode !== 'string' || !body.unitCode.trim()) return invalidParam('unitCode 不合法');
      unitCode = body.unitCode.trim();
    }
    let hours: number | undefined;
    if (body.hours != null) {
      const n = typeof body.hours === 'string' ? Number(body.hours) : typeof body.hours === 'number' ? body.hours : NaN;
      if (!Number.isFinite(n)) return invalidParam('hours 不合法');
      hours = n;
    }
    return this.idleService.settle(userId, unitCode, hours);
  }
}
