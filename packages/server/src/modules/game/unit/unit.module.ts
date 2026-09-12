/**
 * 单位模块（P4）：模板/隐藏词条/掉落表/击杀结算
 *
 * 依赖：GameDatabaseService（game 库）、DatabaseService（用户库：灵韵/灵石）、
 *       CharacterService、ItemAffixService（掉落物品生成）
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../character/character.module.js';
import { ItemModule } from '../item/item.module.js';
import { UnitController } from './unit.controller.js';
import { UnitService } from './unit.service.js';

@Module({
  imports: [CharacterModule, ItemModule],
  controllers: [UnitController],
  providers: [UnitService],
  exports: [UnitService],
})
export class UnitModule {}
