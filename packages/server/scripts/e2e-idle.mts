/**
 * idle 逻辑服 WS 端到端：注册 → 建角 → 带 token 调用 → 无 token 被拦截
 *
 * 用法：先启动服务（pnpm run dev 或 node dist/main.js），再执行 `pnpm run e2e:idle`
 */
import WebSocket from 'ws';

const port = Number(process.env.PORT ?? 3000);
const base = `http://127.0.0.1:${port}/api`;
const wsUrl = `ws://127.0.0.1:${port}/ws`;

interface HttpResult {
  status: number;
  json: Record<string, unknown>;
}

async function post(path: string, body: unknown, token?: string): Promise<HttpResult> {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function wsCall(request: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('WS 超时: ' + JSON.stringify(request)));
    }, 6000);
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
  const username = `e2e_${Date.now()}`;
  const reg = await post('/auth/register', { username, password: 'secret123' });
  const token = (reg.json.data as { token?: string } | undefined)?.token;
  if (!token) throw new Error('注册未拿到 token: ' + JSON.stringify(reg));
  console.log('✓ 注册', reg.status, username);

  const created = await post('/character/create', { nickname: '端到端道友', gender: 'male' }, token);
  console.log('✓ 建角', created.status, JSON.stringify(created.json).slice(0, 100));

  const authed = await wsCall({ cmd: 130, subCmd: 1, data: { __token: token } });
  const authedData = authed.data as { success?: boolean } | undefined;
  console.log('idle.status(带 token) →', JSON.stringify(authed).slice(0, 220));
  if (authedData?.success !== true) throw new Error('鉴权后业务调用失败');

  const anon = await wsCall({ cmd: 130, subCmd: 1, data: {} });
  const anonCode = (anon.data as { data?: { code?: string } } | undefined)?.data?.code;
  console.log('idle.status(无 token) →', JSON.stringify(anon));
  if (anonCode !== 'UNAUTHORIZED') throw new Error('未鉴权请求未被拦截');

  console.log('✓ idle 逻辑服 WS 端到端通过（鉴权 + 业务）');
}

main().catch((err) => {
  console.error('✗ 端到端失败:', (err as Error).message);
  process.exit(1);
});
