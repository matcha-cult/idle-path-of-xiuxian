/**
 * 章节 HTTP Controller（P7）
 *
 * - GET  /api/game/chapters           章节列表
 * - GET  /api/game/chapters/:chapter  章节详情（序号或 code）
 * - POST /api/game/chapter/sync       章节完成判定与发奖（幂等）
 */
import { Controller, Get, Param, Post } from '@nestjs/common';
import { UserId } from '../../../common/decorators/user-id.decorator.js';
import { ChapterService } from './chapter.service.js';

@Controller('game')
export class ChapterController {
  constructor(private readonly chapterService: ChapterService) {}

  @Get('chapters')
  async list(@UserId() userId: number) {
    return this.chapterService.list(userId);
  }

  @Get('chapters/:chapter')
  async detail(@UserId() userId: number, @Param('chapter') chapter: string) {
    return this.chapterService.detail(userId, chapter);
  }

  @Post('chapter/sync')
  async sync(@UserId() userId: number) {
    return this.chapterService.sync(userId);
  }
}
