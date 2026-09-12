/**
 * economy 逻辑服模块（L1，依赖 item, prop）
 */
import { Module } from '@nestjs/common';
import { CurrencyModule } from './internal/economy-internal.module.js';
import { EconomyAction } from './economy.action.js';
import { EconomyLogicService } from './economy.logic.service.js';

@Module({
  imports: [CurrencyModule],
  providers: [EconomyLogicService, EconomyAction],
  exports: [EconomyLogicService, EconomyAction],
})
export class EconomyLogicModule {}
