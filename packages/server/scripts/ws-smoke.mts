/**
 * WS 通道冒烟：校验 attach 模式下的 /ws 路由
 *
 * 用例：
 * 1. system.ping（cmd=1,subCmd=1）→ 免鉴权，返回 { data: { status: 'ok' } }
 * 2. 未注册路由（cmd=999）→ { errorCode: 404 }
 *
 * 用法：先启动服务，再执行 `pnpm run smoke:ws`
 */
import WebSocket from 'ws';

const port = Number(process.env.PORT ?? 3000);
const url = process.env.WS_URL ?? `ws://127.0.0.1:${port}/ws`;

function probe(request: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`超时未收到响应: ${JSON.stringify(request)}`));
    }, 5000);
    ws.on('open', () => ws.send(JSON.stringify(request)));
    ws.on('message', (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(raw.toString()) as Record<string, unknown>);
      ws.close();
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main(): Promise<void> {
  const ping = await probe({ cmd: 1, subCmd: 1, data: {} });
  console.log('system.ping →', JSON.stringify(ping));
  const pingData = ping.data as { status?: string } | undefined;
  if (ping.errorCode || pingData?.status !== 'ok') {
    throw new Error('system.ping 未返回 ok');
  }

  const missing = await probe({ cmd: 999, subCmd: 1, data: {} });
  console.log('cmd=999    →', JSON.stringify(missing));
  if (missing.errorCode !== 404) {
    throw new Error('未注册路由未返回 404');
  }

  console.log('✓ WS 冒烟通过');
}

main().catch((err) => {
  console.error('✗ WS 冒烟失败:', (err as Error).message);
  process.exit(1);
});
