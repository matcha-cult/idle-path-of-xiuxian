/**
 * story 逻辑服模块（L3，依赖 quest）
 */
import { Module } from '@nestjs/common';
import { StoryModule } from './internal/story-internal.module.js';
import { StoryAction } from './story.action.js';
import { StoryLogicService } from './story.logic.service.js';

@Module({
  imports: [StoryModule],
  providers: [StoryLogicService, StoryAction],
  exports: [StoryLogicService, StoryAction],
})
export class StoryLogicModule {}
