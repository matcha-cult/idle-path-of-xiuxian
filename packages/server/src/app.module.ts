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
import { verifyBearerHeader, verifyJwt } from './common/auth/jwt.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';

/** 从 WS 握手 URL 中取 `?token=`（浏览器无法设置握手头时的通道） */
function tokenFromUrl(url: string): string {
  try {
    return new URL(url, 'http://localhost').searchParams.get('token') ?? '';
  } catch {
    return '';
  }
}

@Module({
  imports: [
    // ionet 外部服：HTTP 关闭（游戏 HTTP 由 NestJS 承担），WS attach 到 NestJS http.Server 的 /ws。
    // Action 不在此声明（actions: []），统一由 GameActionBridgeModule 以 DI 实例注册。
    //
    // allowProduction：框架默认在 NODE_ENV=production 下拒绝启动；需要自管 Node 生产部署时，
    // 显式设置 IONET_ALLOW_PRODUCTION=true 放行（否则保持默认禁用，见 ai-docs 计划 R7）。
    //
    // authenticate：WS **握手鉴权**（框架 d8a4f71）。凭据二选一：
    //   · `Authorization: Bearer <jwt>`（Node 客户端可设置握手头）
    //   · URL 查询参数 `?token=<jwt>`（浏览器 WebSocket 无法设置请求头）
    // 校验通过 → 整条连接绑定 userId，之后每次 execute 的 FlowContext 由框架经
    // onFlowContext 预置该 userId；校验失败/缺失 → 拒绝升级（401）。
    // 因握手鉴权是强制的，原 `data.__token` 兜底（WsAuthInOut）已删除。
    IonetModule.forRoot({
      actions: [],
      httpServer: false,
      wsServer: {
        attachNestServer: true,
        path: '/ws',
        authenticate: async ({ headers, url }) => {
          const payload = verifyBearerHeader(headers.authorization) ?? verifyJwt(tokenFromUrl(url));
          return payload ? { userId: BigInt(payload.id) } : null;
        },
      },
      redis: false,
      allowProduction: process.env.IONET_ALLOW_PRODUCTION === 'true',
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
