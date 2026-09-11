/**
 * 物品模块（ItemModule）
 *
 * 依赖：GameDatabaseService（game 库）、CharacterService（用户库，角色归属解析）
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../character/character.module.js';
import { ItemAffixService } from './item.affix.service.js';
import { ItemController } from './item.controller.js';
import { ItemService } from './item.service.js';

@Module({
  // GameDatabaseService 由 GameModule（@Global）提供，勿重复声明
  imports: [CharacterModule],
  controllers: [ItemController],
  providers: [ItemAffixService, ItemService],
  exports: [ItemService, ItemAffixService],
})
export class ItemModule {}
