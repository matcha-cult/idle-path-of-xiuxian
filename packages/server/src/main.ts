/**
 * 放置·修仙之路 Server 入口
 *
 * 架构说明：
 * - HTTP 完全采用 NestJS 风格（Auth/Character/Health REST，挂载 /api）。
 * - ionet-ts 外部服以 attach 模式挂到同一个 http.Server 的 /ws（单端口）。
 * - 任务 4：Action 实例由框架在 `onModuleInit` 经 `resolveAction` 从容器解析，
 *   因此必须在 `app.init()` 之前写入 `appRef.app`（见 src/ionet/app-ref.ts）。
 * - 注册完成后（`app.init()` 之后）做一次全局重复路由断言，再 `listen`。
 */
import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { IONET_BAR_SKELETON, IonetModule } from '@nbb-ionet/extension-nestjs';
import { type BarSkeleton } from '@nbb-ionet/core-framework';
import { AppModule } from './app.module.js';
import { appRef } from './ionet/app-ref.js';
import { assertNoDuplicateRoutes } from './ionet/route-check.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // HTTP API 统一挂载在 /api 前缀下
  app.setGlobalPrefix('api');

  // 任务 4：resolveAction 需要 app 引用；必须在 app.init()（触发 onModuleInit）之前就位
  appRef.app = app;

  // 把 NestJS 的 http.Server 交给 ionet 外部服（attach 模式），须早于 init()
  app.get(IonetModule).attachHttpServer(app.getHttpServer());

  // 触发 onModuleInit：框架在此从容器解析 Action、注册进骨架，并挂上 /ws upgrade 监听
  await app.init();

  // 注册完成后做全局重复路由断言（同一 cmd/subCmd 只能有一个 Action）
  const skeleton = app.get<BarSkeleton>(IONET_BAR_SKELETON);
  assertNoDuplicateRoutes(
    skeleton.actionCommandRegions.getAllActionCommands().map((command) => ({
      cmd: command.cmdInfo.cmd,
      subCmd: command.cmdInfo.subCmd,
      label: command.actionControllerClass.name + '.' + command.methodName,
    })),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[放置·修仙之路] HTTP http://localhost:${port}/api`);
  console.log(`[放置·修仙之路] WS   ws://localhost:${port}/ws`);
}

void bootstrap();
