/**
 * 任务模块（P6）
 *
 * 依赖 CharacterModule（角色解析）、DatabaseService（用户库：灵韵/灵石/玉简）
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../character/character.module.js';
import { QuestController } from './quest.controller.js';
import { QuestService } from './quest.service.js';

@Module({
  imports: [CharacterModule],
  controllers: [QuestController],
  providers: [QuestService],
  exports: [QuestService],
})
export class QuestModule {}
