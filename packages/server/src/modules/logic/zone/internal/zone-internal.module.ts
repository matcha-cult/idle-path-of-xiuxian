/**
 * 秘境模块（P5.1）
 *
 * 依赖 UnitModule（层内结算 settleKills）、CharacterModule（角色解析）
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../../character/character.module.js';
import { CombatLogicModule } from '../../combat/combat-logic.module.js';
import { ZoneService } from './zone.service.js';

@Module({
  imports: [CharacterModule, CombatLogicModule],
  providers: [ZoneService],
  exports: [ZoneService],
})
export class ZoneModule {}
