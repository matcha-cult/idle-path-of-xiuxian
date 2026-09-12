/**
 * 任务 HTTP Controller（P6）
 *
 * - GET  /api/game/quests          任务列表（状态 + 目标进度）
 * - GET  /api/game/quests/:code    任务详情
 * - POST /api/game/quest/sync      推进任务（激活 + 完成 + 发奖，幂等）
 */
import { Controller, Get, Param, Post } from '@nestjs/common';
import { UserId } from '../../../common/decorators/user-id.decorator.js';
import { QuestService } from './quest.service.js';

@Controller('game')
export class QuestController {
  constructor(private readonly questService: QuestService) {}

  @Get('quests')
  async list(@UserId() userId: number) {
    return this.questService.list(userId);
  }

  @Get('quests/:code')
  async detail(@UserId() userId: number, @Param('code') code: string) {
    return this.questService.detail(userId, code);
  }

  @Post('quest/sync')
  async sync(@UserId() userId: number) {
    return this.questService.sync(userId);
  }
}
