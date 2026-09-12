/**
 * 演出模块（P7.2）
 *
 * 依赖 QuestModule（复用任务状态）、CharacterModule（角色解析）
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../../character/character.module.js';
import { QuestModule } from '../../../game/quest/quest.module.js';
import { StoryService } from './story.service.js';

@Module({
  imports: [CharacterModule, QuestModule],
  providers: [StoryService],
  exports: [StoryService],
})
export class StoryModule {}
