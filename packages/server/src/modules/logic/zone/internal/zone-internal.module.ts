/**
 * 秘境模块（P5.1 + P3.0 + §22 重做）
 *
 * 依赖 CombatLogicModule（层内结算 settleKills）、CharacterModule（角色解析 + 战力）、
 * OnlineModule（不是本文件 —— 在线会话登记在 online-session.service，由全局模块提供）。
 *
 * §22：**不再依赖 MapLogicModule** —— 秘境与地图节点彻底解耦后，
 * 「层数推进 → 置位地图节点 idle_unlocked」「在线历练秘境峰白名单」两条跨域钩子全部删除
 * （战斗上下文只由 `game_zone_state` 决定）。
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../../character/character.module.js';
import { CombatLogicModule } from '../../combat/combat-logic.module.js';
import { ZoneService } from './zone.service.js';
import { ONLINE_EXPLORE_OPTIONS, OnlineExploreService } from './online-explore.service.js';
import { OnlineNotifyService } from './online-notify.service.js';

@Module({
  imports: [CharacterModule, CombatLogicModule],
  providers: [
    ZoneService,
    OnlineExploreService,
    OnlineNotifyService,
    // 生产走默认值；仅为让 Nest 能解析构造选项（见 token 注释）
    { provide: ONLINE_EXPLORE_OPTIONS, useValue: {} },
  ],
  exports: [ZoneService, OnlineExploreService, OnlineNotifyService],
})
export class ZoneModule {}