/**
 * 根模块
 *
 * 通道划分：
 * - HTTP /api/*：基础能力（auth / character / health），NestJS REST
 * - WS   /ws   ：其余全部游戏交互，ionet 外部服统一接入
 *
 * 模块划分：
 * - DatabaseModule / AuthModule / CharacterModule：用户系统（HTTP）
 * - GameModule：游戏业务服务（逻辑服的服务层，M3 起按逻辑服重组）
 * - EdgeModule：对外服（广播 / 通知 / 推送），只实现 NotificationPort
 * - GameActionBridgeModule：把带 DI 的 Action 实例注册进 ionet BarSkeleton
 * - IonetModule：构建 BarSkeleton，attach 到 NestJS http.Server 的 /ws
 */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { IonetModule } from '@nbb-ionet/extension-nestjs';
import { DatabaseModule } from './modules/database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CharacterModule } from './modules/character/character.module.js';
import { GameModule } from './modules/game/game.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { EdgeModule } from './modules/edge/edge.module.js';
import { GameActionBridgeModule } from './ionet/game-action-bridge.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';

@Module({
  imports: [
    // ionet 外部服：HTTP 关闭（游戏 HTTP 由 NestJS 承担），WS attach 到 NestJS http.Server 的 /ws。
    // Action 不在此声明（actions: []），统一由 GameActionBridgeModule 以 DI 实例注册。
    IonetModule.forRoot({
      actions: [],
      httpServer: false,
      wsServer: { attachNestServer: true, path: '/ws' },
      redis: false,
    }),
    DatabaseModule,
    AuthModule,
    CharacterModule,
    GameModule,
    HealthModule,
    EdgeModule,
    GameActionBridgeModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
