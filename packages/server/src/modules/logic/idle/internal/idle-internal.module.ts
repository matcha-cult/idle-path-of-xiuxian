/**
 * 离线收益模块（P4.2）
 *
 * 依赖 UnitModule（复用 settleKills）、CharacterModule（角色解析）、
 * ZoneLogicModule（当前秘境遭遇）、MapLogicModule（R2 离线闸门）
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../../character/character.module.js';
import { CombatLogicModule } from '../../combat/combat-logic.module.js';
import { MapLogicModule } from '../../map/map-logic.module.js';
import { ZoneLogicModule } from '../../zone/zone-logic.module.js';
import { IdleService } from './idle.service.js';

@Module({
  imports: [CharacterModule, CombatLogicModule, ZoneLogicModule, MapLogicModule],
  providers: [IdleService],
  exports: [IdleService],
})
export class IdleModule {}
