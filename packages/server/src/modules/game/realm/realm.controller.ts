/**
 * 境界突破 HTTP Controller（NestJS 风格）
 * - GET  /api/game/breakthrough  境界状态与下一境消耗
 * - POST /api/game/breakthrough  突破（消耗灵韵必定成功）
 */
import { Controller, Get, Post } from '@nestjs/common';
import { UserId } from '../../../common/decorators/user-id.decorator.js';
import { RealmService } from './realm.service.js';

@Controller('game')
export class RealmController {
  constructor(private readonly realmService: RealmService) {}

  @Get('breakthrough')
  async status(@UserId() userId: number) {
    return this.realmService.status(userId);
  }

  @Post('breakthrough')
  async breakthrough(@UserId() userId: number) {
    return this.realmService.breakthrough(userId);
  }
}
