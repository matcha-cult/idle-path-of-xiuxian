/**
 * 放置·修仙之路 Server 入口
 *
 * 架构说明：
 * - HTTP 完全采用 NestJS 风格（Auth/Character REST Controller）。
 * - ionet-ts 侧仅保留最小示例 Action（HealthAction），不启用 ionet-ts HTTP/WS 外部服务；
 *   ionet-ts WS 接口不做任何调整。
 * - NestJS 侧预留 /ws-user 作为 WS 连接入口，仅负责连接接入/握手。
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // 使用 ws 库作为 NestJS WebSocket 适配器，预留 /ws-user 连接入口
  app.useWebSocketAdapter(new WsAdapter(app));

  // HTTP API 统一挂载在 /api 前缀下
  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[放置·修仙之路] server listening on http://localhost:${port}/api`);
}

void bootstrap();
