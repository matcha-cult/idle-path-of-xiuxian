/**
 * 放置·修仙之路 Server 入口
 *
 * 架构说明：
 * - HTTP 完全采用 NestJS 风格（Auth/Character/Health REST，挂载 /api）。
 * - ionet-ts 外部服以 attach 模式挂到同一个 http.Server 的 /ws：
 *   单端口（三合一），须在 app.init()/listen() 之前把 http.Server 推给 IonetModule，
 *   其 onModuleInit 才会挂上 /ws 的 upgrade 监听。
 * - 不再使用 NestJS WsAdapter / 独立 WS 网关，避免 upgrade 冲突。
 */
import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { IonetModule } from '@nbb-ionet/extension-nestjs';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // HTTP API 统一挂载在 /api 前缀下
  app.setGlobalPrefix('api');

  // 把 NestJS 的 http.Server 交给 ionet 外部服（attach 模式），须早于 listen()
  app.get(IonetModule).attachHttpServer(app.getHttpServer());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[放置·修仙之路] HTTP http://localhost:${port}/api`);
  console.log(`[放置·修仙之路] WS   ws://localhost:${port}/ws`);
}

void bootstrap();
