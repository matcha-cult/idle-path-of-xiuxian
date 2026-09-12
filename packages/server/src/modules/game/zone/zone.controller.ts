/**
 * 秘境 HTTP Controller（P5.1）
 *
 * - GET  /api/game/zones            秘境图鉴（解锁 + 进度）
 * - GET  /api/game/zone/progress    当前秘境进度
 * - POST /api/game/zone/enter       切换当前秘境
 * - POST /api/game/zone/challenge   层数挑战
 */
import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserId } from '../../../common/decorators/user-id.decorator.js';
import { ZoneService } from './zone.service.js';

function invalidParam(message = '参数不合法') {
  return { success: false, message, data: { code: 'INVALID_PARAM' } };
}

@Controller('game')
export class ZoneController {
  constructor(private readonly zoneService: ZoneService) {}

  @Get('zones')
  async catalog(@UserId() userId: number) {
    return this.zoneService.catalog(userId);
  }

  @Get('zone/progress')
  async progress(@UserId() userId: number) {
    return this.zoneService.progress(userId);
  }

  @Post('zone/enter')
  async enter(@UserId() userId: number, @Body() body: { zoneCode?: unknown }) {
    if (typeof body.zoneCode !== 'string' || !body.zoneCode.trim()) return invalidParam('zoneCode 必填');
    return this.zoneService.enter(userId, body.zoneCode.trim());
  }

  @Post('zone/challenge')
  async challenge(@UserId() userId: number, @Body() body: { zoneCode?: unknown }) {
    let zoneCode: string | undefined;
    if (body.zoneCode != null) {
      if (typeof body.zoneCode !== 'string' || !body.zoneCode.trim()) return invalidParam('zoneCode 不合法');
      zoneCode = body.zoneCode.trim();
    }
    return this.zoneService.challenge(userId, zoneCode);
  }
}
