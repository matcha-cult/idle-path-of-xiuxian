/**
 * 应用实例持有者
 *
 * 任务 4 的 `resolveAction` 需要从 NestJS 容器解析 Action 实例，而该方法在
 * `AppModule` 的模块定义期就要给出；此时 `NestFactory.create` 还没返回。
 * 框架把实例解析推迟到 `onModuleInit`（app 就绪后），因此这里用一个可变引用：
 * `main.ts` 在 `app.init()` 之前写入，框架在 `onModuleInit` 读取。
 */
import { type INestApplication } from '@nestjs/common';

export const appRef: { app?: INestApplication } = {};
