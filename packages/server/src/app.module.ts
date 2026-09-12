/**
 * 根模块
 *
 * 通道划分：
 * - HTTP /api/*：基础能力（auth / character / health），NestJS REST
 * - WS   /ws   ：其余全部游戏交互，ionet 外部服统一接入
 *
 * 模块划分：
 * - DatabaseModule / AuthModule / CharacterModule：用户系统（HTTP）
 * - GameModule：游戏**基础设施**（GameDatabaseService + RateLimiterService + StatModule）
 * - 各 LogicModule：11 个逻辑服（提供并导出各自的 Action 与门面）
 * - EdgeModule：对外服（广播 / 通知 / 推送），只实现 NotificationPort
 * - IonetModule：构建 BarSkeleton；经 `actions + resolveAction` 在 onModuleInit 从容器解析 Action
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
import { GAME_ACTION_CLASSES, GAME_LOGIC_MODULES } from './ionet/game-actions.js';
import { appRef } from './ionet/app-ref.js';
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
    //
    // 任务 4：`actions + resolveAction` —— 框架把实例解析推迟到 onModuleInit（app 就绪后），
    // 从 NestJS 容器取 Action 实例，Action 因此具备 DI。Action 类必须是容器 provider
    // （由下方各 LogicModule 提供），不再需要应用侧的桥接模块。
    //
    // allowProduction：框架默认在 NODE_ENV=production 下拒绝启动；需要自管 Node 生产部署时，
    // 显式设置 IONET_ALLOW_PRODUCTION=true 放行（否则保持默认禁用，见 ai-docs 计划 R7）。
    //
    // authenticate：WS **握手鉴权**（框架 d8a4f71）。凭据二选一：
    //   · `Authorization: Bearer <jwt>`（Node 客户端可设置握手头）
    //   · URL 查询参数 `?token=<jwt>`（浏览器 WebSocket 无法设置请求头）
    // 校验通过 → 整条连接绑定 userId，之后每次 execute 的 FlowContext 由框架经
    // onFlowContext 预置该 userId；校验失败/缺失 → 拒绝升级（401）。
    IonetModule.forRoot({
      actions: [...GAME_ACTION_CLASSES],
      resolveAction: (ActionClass) => {
        const app = appRef.app;
        if (!app) {
          throw new Error(
            '[ionet] resolveAction 需要 NestJS app 引用：请在 main.ts 中于 app.init() 之前设置 appRef.app',
          );
        }
        return app.get(ActionClass);
      },
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
    ...GAME_LOGIC_MODULES,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
