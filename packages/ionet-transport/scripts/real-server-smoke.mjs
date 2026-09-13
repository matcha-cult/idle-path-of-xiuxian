/**
 * 真实后端冒烟（T1/T3 验收，Node 24 自带全局 WebSocket → 直接复用 BrowserSocketAdapter）。
 *
 * 链路：REST 注册 → REST 登录 → REST 建角 → WS `?token=` 握手 → 应用层心跳
 *        → reqId 并发拉面板 → 业务失败判定（data.success===false）。
 *
 * 前置：后端已启动（默认 http://127.0.0.1:3000，端口用 PORT 覆盖）。
 * 用法：pnpm --filter @idle-path/ionet-transport run smoke:real
 */
import {
  BusinessError,
  GameApi,
  IonetClient,
  RestApi,
} from '../dist/index.js';

const port = Number(process.env.PORT ?? 3000);
const origin = `http://127.0.0.1:${port}`;

const failures = [];
function check(name, ok, detail) {
  const suffix = ok || detail === undefined ? '' : ' → ' + JSON.stringify(detail).slice(0, 240);
  console.log(`${ok ? '✓' : '✗'} ${name}${suffix}`);
  if (!ok) failures.push(name);
  return ok;
}

async function main() {
  const username = `smoke_${Date.now()}`;
  const password = 'secret123';

  // 1) REST：注册 + 登录 + 建角（经 transport 的 RestApi，与前端同一实现）
  const rest = new RestApi({ baseUrl: `${origin}/api` });
  const registered = await rest.auth.register(username, password);
  check('REST 注册', registered.success === true, registered.message);
  const loggedIn = await rest.auth.login(username, password);
  const token = loggedIn.data?.token;
  check('REST 登录拿到 JWT', typeof token === 'string' && token.length > 0, loggedIn.message);

  const authedRest = new RestApi({ baseUrl: `${origin}/api`, tokenProvider: () => token });
  const created = await authedRest.character.create('冒烟道友', 'male');
  const characterId = created.data?.character?.id;
  check('REST 创建角色', created.success === true && typeof characterId === 'number', created.message);

  // 2) WS：浏览器同款握手（?token=，PROTOCOL.md §6）+ 应用层心跳 + reqId 并发
  const handshakeUrls = [];
  const { BrowserSocketAdapter } = await import('../dist/index.js');
  const client = new IonetClient({
    url: `ws://127.0.0.1:${port}/ws`,
    authHandler: () => token,
    heartbeat: { intervalMs: 1500, timeoutMs: 1200, cmd: 1, subCmd: 1 },
    reconnect: { enabled: true, baseDelayMs: 200, maxDelayMs: 1000 },
    requestTimeoutMs: 8000,
    logger: () => undefined,
    // 包一层以记录真实握手 URL（证明 token 走 query 而非 header）
    adapterFactory: () => {
      const adapter = new BrowserSocketAdapter();
      const connect = adapter.connect.bind(adapter);
      adapter.connect = (url) => {
        handshakeUrls.push(url);
        connect(url);
      };
      return adapter;
    },
  });
  await client.connect();
  check('WS ?token= 握手成功（state=online）', client.getState() === 'online', client.getStateDetail());
  check(
    '握手 URL 携带 ?token=（浏览器唯一可行通道）',
    handshakeUrls.length === 1 && handshakeUrls[0].includes('?token=') && !handshakeUrls[0].includes('Authorization'),
    handshakeUrls,
  );

  const game = new GameApi(client);

  // 3) system.ping (1,1) 免鉴权往返（裸对象，无 success/message 包装）
  const pong = await game.system.ping();
  check('system.ping (1,1) 返回裸对象', pong?.status === 'ok' && pong?.service === 'idle-path-of-xiuxian', pong);

  // 4) reqId 并发拉面板（慢 Action 不阻塞后续）
  const startedAt = Date.now();
  const [inventory, equipment, currencies, realm, skillPanel, zones, quests, idle] = await Promise.all([
    game.item.inventory({ page: 1, pageSize: 20 }),
    game.equip.equipment(),
    game.economy.currencies(),
    game.realm.breakthroughInfo(),
    game.skill.panel(),
    game.zone.zones(),
    game.quest.list(),
    game.idle.status(),
  ]);
  const elapsed = Date.now() - startedAt;
  check('并发 8 个 Action 全部成功', [inventory, equipment, currencies, realm, skillPanel, zones, quests, idle].every((r) => r.success === true));
  check('背包 data.items 为数组', Array.isArray(inventory.data?.items), inventory.data);
  check('装备栏 data.slots 为对象', equipment.data?.slots !== undefined && typeof equipment.data.slots === 'object');
  check('通货 data.currencies 为数组', Array.isArray(currencies.data?.currencies), currencies.data);
  check('境界 data.realmName 存在', typeof realm.data?.realmName === 'string', realm.data);
  check('并发耗时合理（<8s 单请求超时）', elapsed < 8000, { elapsed });
  console.log(`  · 并发 8 Action 耗时 ${elapsed}ms，inFlight=${client.inFlight}`);

  // 5) 业务失败判定：errorCode 为 0，但 data.success===false（06 §2）
  const notFound = await game.item.inventoryDetail(999_999_999).catch((error) => error);
  check('业务失败抛 BusinessError', notFound instanceof BusinessError, String(notFound));
  check('业务码 = ITEM_NOT_FOUND', notFound instanceof BusinessError && notFound.code === 'ITEM_NOT_FOUND', notFound?.code);

  // 6) allowBusinessFailure 分支：业务失败体原样返回（不抛）
  const tolerated = await game.item.inventoryDetail(999_999_999, { allowBusinessFailure: true });
  check('allowBusinessFailure 返回失败体', tolerated.success === false, tolerated);

  // 7) 心跳存活
  await new Promise((resolve) => setTimeout(resolve, 3200));
  check('应用层心跳收到 ack（>=1）', client.heartbeatAcks >= 1, { acks: client.heartbeatAcks });
  const alive = await game.item.inventory({ page: 1, pageSize: 1 });
  check('心跳后连接仍可用', alive.success === true, alive);

  // 8) 未鉴权拒绝：新连接不带 token → 握手被拒（HTTP 401 在浏览器表现为未 open 即 close）
  const anon = new IonetClient({
    url: `ws://127.0.0.1:${port}/ws`,
    heartbeat: false,
    reconnect: { enabled: false },
    requestTimeoutMs: 4000,
    logger: () => undefined,
  });
  const anonResult = await anon.connect().then(
    () => 'connected',
    (error) => error,
  );
  check('无 token 握手被拒（HandshakeError）', anonResult !== 'connected', String(anonResult));
  anon.close();

  client.close();

  if (failures.length > 0) {
    console.error('\n✗ 失败项: ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('\n✓ 真实后端冒烟通过（REST 登录 → ?token= 握手 → 心跳 → 并发面板 → 业务失败判定 → 401 拒连）');
}

main().catch((error) => {
  console.error('✗ 冒烟失败:', error);
  process.exit(1);
});
