/**
 * 通货与炼器模块（P3 第一批）
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../character/character.module.js';
import { ItemModule } from '../item/item.module.js';
import { CraftService } from './craft.service.js';
import { CurrencyController } from './currency.controller.js';
import { CurrencyService } from './currency.service.js';

@Module({
  imports: [CharacterModule, ItemModule],
  controllers: [CurrencyController],
  providers: [CurrencyService, CraftService],
  exports: [CurrencyService, CraftService],
})
export class CurrencyModule {}
