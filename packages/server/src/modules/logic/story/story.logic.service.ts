/**
 * story 逻辑服门面（L3，依赖 quest）
 */
import { Injectable } from '@nestjs/common';
import { StoryService } from '../../game/story/story.service.js';

@Injectable()
export class StoryLogicService {
  constructor(private readonly storyService: StoryService) {}

  chapterStory(userId: number, key: string) {
    return this.storyService.chapterStory(userId, key);
  }

  questStory(userId: number, code: string) {
    return this.storyService.questStory(userId, code);
  }

  markSeen(userId: number, nodeKey: string) {
    return this.storyService.markSeen(userId, nodeKey);
  }
}
