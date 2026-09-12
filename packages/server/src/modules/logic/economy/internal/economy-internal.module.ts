/**
 * 通货与炼器模块（P3 第一批）
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../../character/character.module.js';
import { ItemLogicModule } from '../../item/item-logic.module.js';
import { CraftService } from './craft.service.js';
import { CurrencyService } from './currency.service.js';

@Module({
  imports: [CharacterModule, ItemLogicModule],
  providers: [CurrencyService, CraftService],
  exports: [CurrencyService, CraftService],
})
export class CurrencyModule {}
