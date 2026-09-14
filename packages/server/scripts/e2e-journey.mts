/**
 * M5 端到端验收：注册 → 登录 → 建角 → 拉背包 → 装备 → 突破 → 秘境 → 任务 → 断线重连
 *
 * 全程经 WS 参考客户端（串行队列 + 应用层心跳 + 断线重连重新带 token）。
 * 用法：先启动服务，再执行 `pnpm run e2e:journey`
 */
import WebSocket from 'ws';
import { WarWsClient } from './sdk/ws-client.js';

const port = Number(process.env.PORT ?? 3000);
const base = `http://127.0.0.1:${port}/api/`;
const wsUrl = `ws://127.0.0.1:${port}/ws`;

async function post(path: string, body: unknown, token?: string): Promise<Record<string, unknown>> {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown): boolean {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || detail === undefined ? '' : ' → ' + JSON.stringify(detail).slice(0, 200)}`);
  if (!ok) failures.push(name);
  return ok;
}

function business(res: Record<string, unknown>): { ok: boolean; success?: boolean; message?: string } {
  if (res.errorCode) return { ok: false };
  const data = res.data as { success?: boolean; message?: string } | undefined;
  return { ok: true, success: data?.success, message: data?.message };
}

async function main(): Promise<void> {
  const username = `journey_${Date.now()}`;
  const password = 'secret123';

  // 1) 注册（HTTP）
  const reg = await post('auth/register', { username, password });
  check('注册', reg.success === true, reg.message);

  // 2) 登录（HTTP）—— 取正式 token
  const login = await post('auth/login', { username, password });
  const tokenData = login.data as { token?: string } | undefined;
  let token = tokenData?.token;
  check('登录', typeof token === 'string' && token.length > 0, login.message);
  if (!token) throw new Error('登录未拿到 token');

  // 3) 建角（HTTP）
  const created = await post('character/create', { nickname: '验收道友', gender: 'male' }, token);
  const characterId = (created.data as { character?: { id?: number } } | undefined)?.character?.id;
  check('创建角色', created.success === true && typeof characterId === 'number', created.message);

  // 4) WS 客户端（reqId 配对 + 并发 + 握手鉴权 + 心跳 + 重连换 token）
  const client = new WarWsClient({
    url: wsUrl,
    WebSocketImpl: WebSocket,
    // 任务 3：改用 WS **握手鉴权**（upgrade 时带 Authorization 头），不再依赖 data.__token
    getAuthHeaders: () => ({ Authorization: `Bearer ${token}` }),
    heartbeatMs: 1500,
    requestTimeoutMs: 8000,
    onLog: () => undefined,
  });
  await client.connect();
  check('WS 连接', client.connected);

  // 5) 拉背包
  const inv = await client.call(30, 1, { page: 1, pageSize: 20 });
  check('拉背包 item.inventory', business(inv).ok && business(inv).success === true, inv);

  // 6) 生成 + 装备
  const bases = await client.call(30, 3, { page: 1, pageSize: 1 });
  const baseList = ((bases.data as { data?: { bases?: Array<{ id?: number }> } } | undefined)?.data?.bases) ?? [];
  const baseId = baseList[0]?.id;
  check('查询基底库 item.bases', typeof baseId === 'number');
  const gen = await client.call(40, 2, { baseId, rarity: 0, characterId });
  const genData = (gen.data as { data?: Record<string, unknown> } | undefined)?.data ?? {};
  const itemId = typeof genData.itemId === 'number' ? genData.itemId : (genData.item as { id?: number } | undefined)?.id;
  check('生成装备 prop.generate', business(gen).success === true && typeof itemId === 'number', gen);
  const equip = await client.call(50, 1, { itemId });
  check('穿戴 equip.equip', business(equip).success === true, equip);
  const equipment = await client.call(50, 3, {});
  check('装备栏 equip.equipment', business(equipment).success === true, equipment);

  // 7) 突破（先 dev 注入灵韵）
  const grant = await client.call(60, 6, { amount: 1000 });
  check('注入灵韵 skill.lingyunGrant', business(grant).success === true, grant);
  const info = await client.call(80, 1, {});
  check('境界状态 realm.breakthroughInfo', business(info).success === true);
  const breakthrough = await client.call(80, 2, {});
  check('突破 realm.breakthrough', business(breakthrough).success === true, breakthrough);

  // 8) 秘境（§22 重做后的完整闭环：图鉴 → 突破 → 战斗进度 → 在线互斥 → 离开 → 挂机点闸门）
  const zones = await client.call(100, 1, {});
  const zoneData = (
    zones.data as
      | {
          data?: {
            zones?: Array<{ code?: string }>;
            breakthrough?: Array<{ code?: string; canBreakthrough?: boolean; tierKind?: string }>;
          };
        }
      | undefined
  )?.data;
  // 新角色尚未突破任何秘境 → `zones` 必为空数组（§22 Q4：未解锁的不下发）；
  // 可突破的目标只能从 `breakthrough`（全量名录）里找。
  const freeRealm = (zoneData?.breakthrough ?? []).find((z) => z.canBreakthrough === true);
  check(
    '秘境图鉴 zone.zones（已突破为空 + 突破名录非空）',
    business(zones).success === true && (zoneData?.zones?.length ?? -1) === 0 && typeof freeRealm?.code === 'string',
    zones,
  );
  if (freeRealm?.code) {
    const zoneCode = freeRealm.code;
    const breakthrough = await client.call(100, 7, { zoneCode });
    check('突破秘境 zone.breakthrough（免费历练秘境放行）', business(breakthrough).ok, breakthrough);

    const progress = await client.call(100, 2, {});
    check('战斗进度 zone.progress', business(progress).success === true, progress);

    // §22 Q6：在线战斗期间离线挂机必须被拒（onLine 状态以 game_zone_state 为准）
    const blockedIdle = await client.call(130, 2, {});
    const blockedCode = (blockedIdle.data as { data?: { code?: string } } | undefined)?.data?.code;
    check('在线战斗中离线挂机被拒（ONLINE_BATTLE_ACTIVE）', blockedCode === 'ONLINE_BATTLE_ACTIVE', blockedIdle);

    // 未突破（clears = 0）不得设为挂机点
    const idleTarget = await client.call(100, 9, { zoneCode });
    const idleCode = (idleTarget.data as { data?: { code?: string } } | undefined)?.data?.code;
    check('未突破不可设为挂机点（ZONE_NOT_IDLE_ELIGIBLE）', idleCode === 'ZONE_NOT_IDLE_ELIGIBLE', idleTarget);

    const leave = await client.call(100, 8, {});
    check('离开秘境 zone.leave', business(leave).success === true, leave);

    // 离开后不在战斗中 → progress 回到 NO_ONLINE_BATTLE（初始态，不是通道失败）
    const afterLeave = await client.call(100, 2, {});
    const afterCode = (afterLeave.data as { data?: { code?: string } } | undefined)?.data?.code;
    check('离开后无战斗（NO_ONLINE_BATTLE）', afterCode === 'NO_ONLINE_BATTLE', afterLeave);

    // 重复挑战入口：未突破时 zone.enter 应被拒
    const enterLocked = await client.call(100, 3, { zoneCode });
    const enterCode = (enterLocked.data as { data?: { code?: string } } | undefined)?.data?.code;
    check('未突破不可直接进入（ZONE_NOT_UNLOCKED）', enterCode === 'ZONE_NOT_UNLOCKED', enterLocked);
  }

  // 9) 任务
  const quests = await client.call(110, 1, {});
  check('任务列表 quest.list', business(quests).success === true, quests);
  const sync = await client.call(110, 3, {});
  check('任务推进 quest.sync', business(sync).success === true, sync);

  // 10) 心跳存活（等待至少一次心跳）
  await new Promise((r) => setTimeout(r, 2000));
  const afterHeartbeat = await client.call(30, 1, { page: 1, pageSize: 1 });
  check('应用层心跳后仍可用', business(afterHeartbeat).success === true);

  // 11) 断线重连：掉线 + 重新登录换新 token + 继续调用
  client.simulateDrop();
  await new Promise((r) => setTimeout(r, 300));
  check('模拟掉线后未连接', !client.connected);
  const relogin = await post('auth/login', { username, password });
  const newToken = (relogin.data as { token?: string } | undefined)?.token;
  if (newToken) token = newToken;
  const afterReconnect = await client.call(30, 1, { page: 1, pageSize: 1 });
  check('断线重连后重新带 token 可继续', business(afterReconnect).ok && business(afterReconnect).success === true, afterReconnect);

  client.close();

  if (failures.length > 0) {
    console.error('\n✗ 失败项: ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('\n✓ M5 端到端验收通过（注册→登录→建角→背包→装备→突破→秘境→任务→重连）');
}

main().catch((err) => {
  console.error('✗ 验收失败:', (err as Error).message);
  process.exit(1);
});
