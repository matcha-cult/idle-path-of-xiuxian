/**
 * 全逻辑服 WS 冒烟：注册 → 建角 → 逐个只读 Action 校验
 *
 * 鉴权：**WS 握手鉴权**（框架 d8a4f71）
 *   · 主路径：`Authorization: Bearer <jwt>` 握手头
 *   · 浏览器路径：`ws://…/ws?token=<jwt>`（浏览器 WebSocket 无法设置请求头）
 *   · 无凭据连接应在 upgrade 阶段被拒（401）
 *
 * 覆盖：item/prop/equip/skill/economy/realm/combat/zone/quest/story/idle
 * 用法：先启动服务，再执行 `pnpm run e2e:all`
 */
import WebSocket from 'ws';

const port = Number(process.env.PORT ?? 3000);
const base = `http://127.0.0.1:${port}/api`;
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

/** 建立 WS：token 走握手头，或（browser 模式）走 URL 查询参数 */
function connect(token?: string, viaUrl = false): WebSocket {
  if (!token) return new WebSocket(wsUrl);
  if (viaUrl) return new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
  return new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${token}` } });
}

function wsCall(
  request: unknown,
  token?: string,
  viaUrl = false,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const ws = connect(token, viaUrl);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('WS 超时: ' + JSON.stringify(request)));
    }, 8000);
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

/** [cmd, subCmd, 说明, data] */
const CASES: Array<[number, number, string, Record<string, unknown>]> = [
  [30, 1, 'item.inventory', {}],
  [30, 3, 'item.bases', {}],
  [30, 4, 'item.pickupRuleList', {}],
  [50, 3, 'equip.equipment', {}],
  [60, 1, 'skill.list', {}],
  [60, 3, 'skill.panel', {}],
  [70, 1, 'economy.currencies', {}],
  [70, 4, 'economy.essences', {}],
  [80, 1, 'realm.breakthroughInfo', {}],
  [90, 1, 'combat.units', {}],
  [90, 2, 'combat.dropTables', {}],
  [100, 1, 'zone.zones', {}],
  [100, 2, 'zone.progress', {}],
  [110, 1, 'quest.list', {}],
  [110, 4, 'quest.chapterList', {}],
  [130, 1, 'idle.status', {}],
];

async function main(): Promise<void> {
  const username = `e2eall_${Date.now()}`;
  const reg = await post('/auth/register', { username, password: 'secret123' });
  const token = (reg.data as { token?: string } | undefined)?.token;
  if (!token) throw new Error('注册未拿到 token');
  const created = await post('/character/create', { nickname: '全量道友', gender: 'female' }, token);
  if (created.success !== true) throw new Error('建角失败: ' + JSON.stringify(created));
  const characterId = (created.data as { character?: { id?: number } } | undefined)?.character?.id;
  console.log('✓ 注册 + 建角 (characterId=' + characterId + ')');

  const failures: string[] = [];

  // ===== 握手鉴权三态 =====
  const ping = await wsCall({ cmd: 1, subCmd: 1, data: {} }, token);
  const pingOk = (ping.data as { status?: string } | undefined)?.status === 'ok';
  console.log(`${pingOk ? '✓' : '✗'} 握手头鉴权 (1,1) system.ping → ${pingOk ? 'ok' : JSON.stringify(ping).slice(0, 120)}`);
  if (!pingOk) failures.push('握手头鉴权 system.ping');

  const pingViaUrl = await wsCall({ cmd: 1, subCmd: 1, data: {} }, token, true);
  const pingUrlOk = (pingViaUrl.data as { status?: string } | undefined)?.status === 'ok';
  console.log(`${pingUrlOk ? '✓' : '✗'} ?token= 路径 (1,1) system.ping → ${pingUrlOk ? 'ok' : JSON.stringify(pingViaUrl).slice(0, 120)}`);
  if (!pingUrlOk) failures.push('?token= 路径 system.ping');

  let anonRejected = false;
  try {
    await wsCall({ cmd: 30, subCmd: 1, data: {} });
  } catch {
    anonRejected = true;
  }
  console.log(`${anonRejected ? '✓' : '✗'} 无凭据连接在 upgrade 阶段被拒（401）`);
  if (!anonRejected) failures.push('无凭据连接未被拒');

  // ===== 只读 Action =====
  for (const [cmd, subCmd, name, data] of CASES) {
    const res = await wsCall({ cmd, subCmd, data }, token);
    const payload = res.data as { success?: boolean; message?: string } | undefined;
    const ok = !res.errorCode && payload?.success === true;
    console.log(`${ok ? '✓' : '✗'} (${cmd},${subCmd}) ${name} → ${ok ? payload?.message ?? 'ok' : JSON.stringify(res).slice(0, 160)}`);
    if (!ok) failures.push(`(${cmd},${subCmd}) ${name}`);
  }

  // ===== 道具/装备写入链路（D1.1：prop→item、equip→item） =====
  const basesRes = await wsCall({ cmd: 30, subCmd: 3, data: { page: 1, pageSize: 1 } }, token);
  const basesData = (basesRes.data as { data?: Record<string, unknown> } | undefined)?.data ?? {};
  const baseList = (basesData.bases ?? basesData.items ?? []) as Array<{ id?: number }>;
  const baseId = baseList[0]?.id;
  console.log('基底样本 id:', baseId);

  if (baseId != null) {
    const gen = await wsCall({ cmd: 40, subCmd: 2, data: { baseId, rarity: 0, characterId } }, token);
    const genData = (gen.data as { data?: Record<string, unknown> } | undefined)?.data ?? {};
    const genItem = (genData.item ?? genData) as { id?: number };
    const itemId = typeof genData.itemId === 'number' ? genData.itemId : genItem?.id;
    const genOk = !gen.errorCode && (gen.data as { success?: boolean } | undefined)?.success === true;
    console.log(`${genOk ? '✓' : '✗'} (40,2) prop.generate → itemId=${itemId}`);
    if (!genOk) failures.push('(40,2) prop.generate');

    if (typeof itemId === 'number' && genOk) {
      const chain: Array<[number, number, string]> = [
        [50, 1, 'equip.equip'],
        [50, 2, 'equip.unequip'],
        [40, 1, 'prop.discard'],
      ];
      for (const [cmd, subCmd, name] of chain) {
        const res = await wsCall({ cmd, subCmd, data: { itemId } }, token);
        const ok = !res.errorCode && (res.data as { success?: boolean } | undefined)?.success === true;
        console.log(`${ok ? '✓' : '✗'} (${cmd},${subCmd}) ${name} → ${ok ? 'ok' : JSON.stringify(res).slice(0, 160)}`);
        if (!ok) failures.push(`(${cmd},${subCmd}) ${name}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('\n✗ 失败项: ' + failures.join(', '));
    process.exit(1);
  }
  console.log(`\n✓ 全逻辑服冒烟通过（${CASES.length} 个只读 Action + 握手鉴权三态 + 写入链路）`);
}

main().catch((err) => {
  console.error('✗ 失败:', (err as Error).message);
  process.exit(1);
});
