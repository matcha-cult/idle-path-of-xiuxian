// @ts-nocheck
// 本脚本刻意从 `dist/` 动态导入（NestJS DI 需要 tsc 产出的 design:paramtypes，
// 而 dist 未开启 declaration，无 .d.ts），故关闭本文件的类型检查；运行期由脚本自身断言保证。
/**
 * 任务 1 端到端验证：连接注册表与定向推送
 *
 * 为什么直接启动 **dist 产物**：NestJS DI 依赖 tsc 产出的 design:paramtypes，
 * 而 tsx/esbuild 不产出该元数据（本项目已踩坑），因此必须用编译产物。
 *
 * 步骤：
 *   1. 启动 AppModule（随机端口，attach 模式 /ws）
 *   2. 注册用户拿 token → 用 `Authorization` 握手头建立 WS
 *   3. 发一次 system.ping 触发框架 onBound → 连接被登记到 userId
 *   4. 经 NOTIFICATION_PORT（EdgeService）调用 sendTo：
 *        · 命中该 userId → true，且客户端收到 `kind:'notification'` 的推送
 *        · 未命中（不存在的 userId）→ false
 *   5. broadcast → 所有在线连接收到
 *
 * 用法：先 `pnpm run build`，再 `pnpm run verify:sendto`
 */
import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import WebSocket from 'ws';

const { AppModule } = await import('../dist/app.module.js');
const { appRef } = await import('../dist/ionet/app-ref.js');
const { NOTIFICATION_PORT } = await import('../dist/common/ports/notification.port.js');
const { IonetModule } = await import('@nbb-ionet/extension-nestjs');

interface NotificationPortLike {
  sendTo(userId: number, message: { cmd: number; subCmd: number; data?: unknown }): boolean;
  broadcast(message: { cmd: number; subCmd: number; data?: unknown }): void;
}

const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || detail === undefined ? '' : ' → ' + JSON.stringify(detail).slice(0, 160)}`);
  if (!ok) failures.push(name);
}

async function waitFor(predicate: () => boolean, ms = 3000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return predicate();
}

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  appRef.app = app;
  app.get(IonetModule).attachHttpServer(app.getHttpServer());
  await app.listen(0); // 随机端口

  const address = app.getHttpServer().address() as { port: number };
  const port = address.port;
  const base = `http://127.0.0.1:${port}/api`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  console.log('服务已启动，端口', port);

  // 1) 注册拿 token
  const username = `sendto_${Date.now()}`;
  const reg = (await (
    await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'secret123' }),
    })
  ).json()) as { data?: { token?: string; user?: { id?: number } } };
  const token = reg.data?.token;
  const userId = reg.data?.user?.id;
  if (!token || typeof userId !== 'number') throw new Error('注册失败: ' + JSON.stringify(reg));
  console.log(`✓ 注册 userId=${userId}`);

  // 2) 握手鉴权建立连接
  const received: Array<Record<string, unknown>> = [];
  const client = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${token}` } });
  client.on('message', (raw) => received.push(JSON.parse(raw.toString()) as Record<string, unknown>));
  await new Promise<void>((resolve, reject) => {
    client.on('open', () => resolve());
    client.on('error', (err) => reject(err));
  });
  check('握手鉴权连接成功', true);

  // 3) 发一次请求触发 onBound（框架在 execute 结束后登记 userId）
  client.send(JSON.stringify({ cmd: 1, subCmd: 1, data: {}, reqId: 'bind-1' }));
  const bound = await waitFor(() => received.some((m) => m.reqId === 'bind-1'));
  check('system.ping 收到响应（触发连接登记）', bound);

  // 4) 定向推送
  const edge = app.get<NotificationPortLike>(NOTIFICATION_PORT);
  const hit = edge.sendTo(userId, { cmd: 100, subCmd: 1, data: { hello: 'world' } });
  check('sendTo(在线 userId) 返回 true', hit === true);
  const gotPush = await waitFor(() => received.some((m) => m.kind === 'notification'));
  check('客户端收到 kind=notification 的定向推送', gotPush);
  const push = received.find((m) => m.kind === 'notification');
  check('推送内容正确', (push?.data as { hello?: string } | undefined)?.hello === 'world', push);

  const miss = edge.sendTo(userId + 999_999, { cmd: 100, subCmd: 1, data: {} });
  check('sendTo(离线 userId) 返回 false', miss === false);

  // 5) 广播
  const before = received.filter((m) => m.kind === 'notification').length;
  edge.broadcast({ cmd: 200, subCmd: 1, data: { broadcast: true } });
  const gotBroadcast = await waitFor(
    () => received.filter((m) => m.kind === 'notification').length > before,
  );
  check('广播送达', gotBroadcast);

  client.close();
  await app.close();

  if (failures.length > 0) {
    console.error('\n✗ 失败项: ' + failures.join(', '));
    process.exit(1);
  }
  console.log('\n✓ 任务 1 端到端验证通过（连接登记 + 定向推送命中/未命中 + 广播）');
}

main().catch((err) => {
  console.error('✗ 失败:', (err as Error).message);
  process.exit(1);
});
