/**
 * prop 逻辑服模块（L0，依赖 item）
 */
import { Module } from '@nestjs/common';
import { ItemLogicModule } from '../item/item-logic.module.js';
import { PropAction } from './prop.action.js';
import { PropLogicService } from './prop.logic.service.js';

@Module({
  imports: [ItemLogicModule],
  providers: [PropLogicService, PropAction],
  exports: [PropLogicService, PropAction],
})
export class PropLogicModule {}
