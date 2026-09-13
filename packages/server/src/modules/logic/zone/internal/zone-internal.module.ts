/**
 * 秘境模块（P5.1 + P3.0）
 *
 * 依赖 UnitModule（层内结算 settleKills）、CharacterModule（角色解析 + 战力）、
 * MapLogicModule（层数推进到 Boss 层时置位地图节点 idle_unlocked，§5.5 / D2；
 *                  以及在线历练的「秘境峰」白名单）、OnlineModule（全局：在线会话登记）。
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../../character/character.module.js';
import { CombatLogicModule } from '../../combat/combat-logic.module.js';
import { MapLogicModule } from '../../map/map-logic.module.js';
import { ZoneService } from './zone.service.js';
import { OnlineExploreService } from './online-explore.service.js';
import { OnlineNotifyService } from './online-notify.service.js';

@Module({
  imports: [CharacterModule, CombatLogicModule, MapLogicModule],
  providers: [ZoneService, OnlineExploreService, OnlineNotifyService],
  exports: [ZoneService, OnlineExploreService, OnlineNotifyService],
})
export class ZoneModule {}
