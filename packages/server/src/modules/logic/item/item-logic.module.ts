/**
 * item 逻辑服模块（L-1）
 */
import { Module } from '@nestjs/common';
import { ItemModule } from './internal/item-internal.module.js';
import { ItemAction } from './item.action.js';
import { ItemLogicService } from './item.logic.service.js';

@Module({
  imports: [ItemModule],
  providers: [ItemLogicService, ItemAction],
  exports: [ItemLogicService, ItemAction],
})
export class ItemLogicModule {}
