/**
 * 任务模块（P6）
 *
 * 依赖 CharacterModule（角色解析）、DatabaseService（用户库：灵韵/灵石/玉简）
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../../character/character.module.js';
import { ChapterService } from './chapter.service.js';
import { QuestService } from './quest.service.js';

@Module({
  imports: [CharacterModule],
  providers: [QuestService, ChapterService],
  exports: [QuestService, ChapterService],
})
export class QuestModule {}
