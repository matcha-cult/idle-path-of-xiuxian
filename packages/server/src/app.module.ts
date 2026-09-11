/**
 * 根模块
 *
 * - DatabaseModule：用户系统独立数据库连接
 * - AuthModule / CharacterModule：用户系统业务模块（HTTP 全部 NestJS 风格）
 * - UserWsModule：NestJS 侧预留 WS 连接入口
 * - IonetModule：ionet-ts 官方示例集成，仅注册 HealthAction，不启用 ionet HTTP/WS
 */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { IonetModule } from '@nbb-ionet/extension-nestjs';
import { DatabaseModule } from './modules/database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CharacterModule } from './modules/character/character.module.js';
import { GameModule } from './modules/game/game.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { UserWsModule } from './modules/ws/user-ws.module.js';
import { HealthAction } from './ionet/health.action.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';

@Module({
  imports: [
    // ionet-ts 官方示例：仅注册 Action，不启动 ionet-ts HTTP/WS 外部服务。
    // 这样不会影响/调整任何 ionet-ts 侧 WS 接口。
    IonetModule.forRoot({
      actions: [HealthAction],
      httpServer: false,
      wsServer: false,
      redis: false,
    }),
    DatabaseModule,
    AuthModule,
    CharacterModule,
    GameModule,
    HealthModule,
    UserWsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
