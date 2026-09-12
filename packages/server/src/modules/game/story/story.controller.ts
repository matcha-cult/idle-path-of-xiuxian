/**
 * 演出 HTTP Controller（P7.2）
 *
 * - GET  /api/game/story/chapter/:chapter  章节剧本节点
 * - GET  /api/game/story/quest/:code       任务剧本节点
 * - POST /api/game/story/seen              标记节点已读
 */
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UserId } from '../../../common/decorators/user-id.decorator.js';
import { StoryService } from './story.service.js';

function invalidParam(message = '参数不合法') {
  return { success: false, message, data: { code: 'INVALID_PARAM' } };
}

@Controller('game')
export class StoryController {
  constructor(private readonly storyService: StoryService) {}

  @Get('story/chapter/:chapter')
  async chapter(@UserId() userId: number, @Param('chapter') chapter: string) {
    return this.storyService.chapterStory(userId, chapter);
  }

  @Get('story/quest/:code')
  async quest(@UserId() userId: number, @Param('code') code: string) {
    return this.storyService.questStory(userId, code);
  }

  @Post('story/seen')
  async seen(@UserId() userId: number, @Body() body: { nodeKey?: unknown }) {
    if (typeof body.nodeKey !== 'string' || !body.nodeKey.trim()) return invalidParam('nodeKey 必填');
    return this.storyService.markSeen(userId, body.nodeKey);
  }
}
