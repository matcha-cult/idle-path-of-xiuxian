/**
 * quest 逻辑服模块（L3，依赖 zone, combat, item）
 */
import { Module } from '@nestjs/common';
import { QuestModule } from './internal/quest-internal.module.js';
import { QuestAction } from './quest.action.js';
import { QuestLogicService } from './quest.logic.service.js';

@Module({
  imports: [QuestModule],
  providers: [QuestLogicService, QuestAction],
  exports: [QuestLogicService, QuestAction],
})
export class QuestLogicModule {}
