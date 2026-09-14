/**
 * 离线收益模块（P4.2；§22 修订）
 *
 * 依赖 CombatLogicModule（复用 settleKills）、CharacterModule（角色解析）、
 * ZoneLogicModule（在线战斗互斥 + 挂机点遭遇）。
 * §22：不再依赖 MapLogicModule —— 离线挂机闸门（idle_unlocked 过渡分支）已随
 * 秘境-地图解耦删除，改为 `game_idle_state` + `zone.idle_allowed + cleared` 判定。
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../../character/character.module.js';
import { CombatLogicModule } from '../../combat/combat-logic.module.js';
import { ZoneLogicModule } from '../../zone/zone-logic.module.js';
import { IdleService } from './idle.service.js';

@Module({
  imports: [CharacterModule, CombatLogicModule, ZoneLogicModule],
  providers: [IdleService],
  exports: [IdleService],
})
export class IdleModule {}