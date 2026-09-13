// @vitest-environment node
/**
 * RootStore 编排测试（T3/T4 验收，假适配器 + 假 REST）：
 * - 登录 → `?token=` 连 WS → **并发**拉面板（8 域 / 12 请求重叠）；
 * - 单域失败不阻断其它域（loadPanel 不 reject）；
 * - 业务失败 → Toast，不污染其它 Store；
 * - bootstrap（本地 token 恢复）与 logout（断连 + 清存储）。
 */
import { describe, expect, it } from 'vitest';
import type { FetchLike } from '@idle-path/ionet-transport';
import { FakeSocketAdapter, MemoryIonetServer, businessFail, type MockHandler } from '@idle-path/ionet-transport/testing';
import { RootStore } from '../src/app/root-store.js';
import type { StorageLike } from '../src/stores/session-store.js';
import { ITEM_CMD, SKILL_CMD, ECONOMY_CMD, REALM_CMD, QUEST_CMD, ZONE_CMD, IDLE_CMD, EQUIP_CMD } from '@idle-path/ionet-transport';
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '../src/stores/session-store.js';

// ===== 假 REST =====

function fakeFetch(): FetchLike {
  return async (input: string) => {
    const body = input.includes('/auth/login')
      ? { success: true, message: '登录成功', data: { token: 'jwt-1', user: { id: 7, username: 'alice' } } }
      : input.includes('/character/check')
        ? {
            success: true,
            message: '已有角色',
            data: {
              hasCharacter: true,
              character: {
                id: 3,
                userId: 7,
                nickname: '道友',
                gender: 'male',
                title: '散修',
                spiritStones: 10000,
                silver: 0,
                realm: 1,
                lingyun: 0,
                jadeSlips: 0,
              },
            },
          }
        : { success: true, message: 'ok', data: {} };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as Response;
  };
}

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

// ===== 假 WS 服务端（按 cmd/subCmd 返回各域 data）=====

const ok = (data: unknown): { data: unknown } => ({ data: { success: true, message: 'ok', data } });
const fail = (code: string, message: string): { data: unknown } => ({ data: businessFail(code, message) });

/** 面板某路由的期望结果：成功 data / 业务失败 / 未覆盖。 */
type PanelReply = { ok: unknown } | { fail: { code: string; message: string } } | undefined;

const PANEL_HANDLER: MockHandler = (req) => {
  const reply = panelReply(req.cmd, req.subCmd, req.data);
  if (reply === undefined) return fail('INVALID_PARAM', '未覆盖的 mock 路由');
  return 'fail' in reply ? fail(reply.fail.code, reply.fail.message) : ok(reply.ok);
};

function panelReply(cmd: number, subCmd: number, requestData?: unknown): PanelReply {
  if (cmd === ITEM_CMD.cmd && subCmd === ITEM_CMD.inventory) {
    const page = (requestData as { page?: number } | undefined)?.page ?? 1;
    return { ok: { total: 1, page, pageSize: 20, items: [sampleItem()] } };
  }
  if (cmd === EQUIP_CMD.cmd && subCmd === EQUIP_CMD.equipment) {
    return { ok: { slots: { weapon: null }, equippedCount: 0 } };
  }
  if (cmd === SKILL_CMD.cmd && subCmd === SKILL_CMD.list) return { ok: { skills: [sampleSkill()] } };
  if (cmd === SKILL_CMD.cmd && subCmd === SKILL_CMD.panel) {
    return { ok: { panel: { xinfa: { main: null, mainInfo: null, aux: [] }, shufa: [] } } };
  }
  if (cmd === ECONOMY_CMD.cmd && subCmd === ECONOMY_CMD.currencies) {
    return {
      ok: { currencies: [{ id: 1, code: 'chaos', name: '混沌石', description: '', implemented: true, owned: 3 }] },
    };
  }
  if (cmd === ECONOMY_CMD.cmd && subCmd === ECONOMY_CMD.essences) return { ok: { essences: [] } };
  if (cmd === REALM_CMD.cmd && subCmd === REALM_CMD.breakthroughInfo) {
    return { ok: { realm: 1, realmName: '炼气', lingyun: 500, nextCost: 100, isMax: false } };
  }
  if (cmd === QUEST_CMD.cmd && subCmd === QUEST_CMD.list) {
    return { ok: { total: 1, completed: 0, quests: [sampleQuest()] } };
  }
  if (cmd === QUEST_CMD.cmd && subCmd === QUEST_CMD.chapterList) {
    return { ok: { total: 1, currentChapter: 1, chapters: [] } };
  }
  if (cmd === ZONE_CMD.cmd && subCmd === ZONE_CMD.zones) {
    return { ok: { total: 0, playerPower: 100, currentZone: null, zones: [] } };
  }
  if (cmd === ZONE_CMD.cmd && subCmd === ZONE_CMD.progress) {
    return { fail: { code: 'ZONE_NOT_FOUND', message: '暂无可用秘境' } };
  }
  if (cmd === IDLE_CMD.cmd && subCmd === IDLE_CMD.status) {
    return {
      ok: {
        realm: 1,
        lastSettleAt: '2026-09-13T00:00:00.000Z',
        pendingHours: 1,
        effectiveHours: 0.9,
        estimatedKills: 10,
        estimatedLingyun: 20,
        dailyItemsProduced: 0,
        dailyItemCap: 200,
        config: { roundsPerHour: 60, efficiencyPct: 90, maxOfflineHours: 24 },
      },
    };
  }
  return undefined;
}

function sampleItem(): Record<string, unknown> {
  return {
    id: 1,
    baseId: 1,
    baseCode: 'sword_1',
    name: '青锋剑',
    category: 'weapon',
    slot: 'weapon',
    rarity: 1,
    rarityName: '灵品',
    tier: 1,
    quality: 0,
    status: 'bag',
    affixTexts: ['攻击 +3'],
    affixes: [],
  };
}

function sampleSkill(): Record<string, unknown> {
  return {
    id: 1,
    code: 'xinfa_1',
    name: '青云诀',
    skillType: 'xinfa',
    daoji: '剑',
    school: '青云',
    spiritCost: 10,
    description: '',
    learned: false,
    level: null,
    effectsTexts: [],
  };
}

function sampleQuest(): Record<string, unknown> {
  return { code: 'q1', name: '初入修界', status: 'active' };
}

/** 真实的适配器 + mock 服务端工厂（每次重连新建）。 */
function createHarness(handler: MockHandler) {
  const adapters: FakeSocketAdapter[] = [];
  const factory = (): FakeSocketAdapter => {
    const adapter = new FakeSocketAdapter();
    new MemoryIonetServer(adapter, { handler }).start();
    adapters.push(adapter);
    return adapter;
  };
  return {
    factory,
    adapters,
    urls: () => adapters.map((a) => a.url ?? ''),
    last: () => adapters[adapters.length - 1] as FakeSocketAdapter,
  };
}

function makeRoot(handler: MockHandler, options: { storage?: StorageLike; fetchImpl?: FetchLike } = {}) {
  const harness = createHarness(handler);
  const root = new RootStore({
    wsUrl: 'ws://test/ws',
    apiBaseUrl: '/api',
    fetchImpl: options.fetchImpl ?? fakeFetch(),
    adapterFactory: harness.factory,
    heartbeat: false,
    reconnect: { enabled: false },
    autoRefreshMetricsMs: 0,
    ...(options.storage !== undefined ? { storage: options.storage } : {}),
  });
  return { root, harness };
}

// ===== 用例 =====

describe('RootStore · 登录 → ?token= → 并发面板', () => {
  it('登录成功后握手 URL 带 token，8 个域全部填充', async () => {
    const { root, harness } = makeRoot(PANEL_HANDLER);
    const okLogin = await root.login('alice', 'secret');
    expect(okLogin).toBe(true);
    expect(root.connection.state).toBe('online');
    expect(harness.urls()[0]).toContain('token=jwt-1');

    expect(root.item.items).toHaveLength(1);
    expect(root.item.total).toBe(1);
    expect(root.skill.catalog).toHaveLength(1);
    expect(root.economy.currencies[0]?.code).toBe('chaos');
    expect(root.realm.status?.realmName).toBe('炼气');
    expect(root.quest.quests).toHaveLength(1);
    expect(root.idle.status?.dailyItemCap).toBe(200);
    // zone.progress 返回 ZONE_NOT_FOUND（业务失败）→ 列表仍成功，progress 保持 null
    expect(root.zone.progress).toBeNull();
    expect(root.session.character?.nickname).toBe('道友');

    root.dispose();
  });

  it('面板加载确为并发（12 个 WS 请求重叠在途）', async () => {
    let inflight = 0;
    let maxInflight = 0;
    let requests = 0;
    const handler: MockHandler = async (req) => {
      const reply = panelReply(req.cmd, req.subCmd, req.data);
      if (reply === undefined || 'fail' in reply) {
        return fail('INVALID_PARAM', '业务失败分支');
      }
      inflight += 1;
      requests += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inflight -= 1;
      return ok(reply.ok);
    };
    const { root } = makeRoot(handler);
    await root.login('alice', 'secret');

    expect(requests).toBeGreaterThanOrEqual(11); // 12 个请求中 zone.progress 走业务失败分支
    expect(maxInflight).toBeGreaterThanOrEqual(4); // 串行实现下必然为 1
    root.dispose();
  });

  it('单域业务失败不阻断其它域，且不产生未捕获拒绝', async () => {
    const handler: MockHandler = (req) => {
      if (req.cmd === REALM_CMD.cmd) return fail('CHARACTER_NOT_FOUND', '尚未创建角色');
      const reply = panelReply(req.cmd, req.subCmd, req.data);
      if (reply === undefined) return fail('INVALID_PARAM', 'x');
      return 'fail' in reply ? fail(reply.fail.code, reply.fail.message) : ok(reply.ok);
    };
    const { root } = makeRoot(handler);
    await expect(root.login('alice', 'secret')).resolves.toBe(true);

    expect(root.realm.status).toBeNull();
    expect(root.realm.error).not.toBeNull();
    // 其它域不受影响
    expect(root.item.items).toHaveLength(1);
    expect(root.economy.currencies).toHaveLength(1);
    // 业务错误经 Toast 转译
    expect(root.toast.toasts.some((t) => t.code === 'CHARACTER_NOT_FOUND')).toBe(true);
    root.dispose();
  });

  it('连接被拒（401）时登录仍成功，仅 toast 提示连接失败', async () => {
    const root = new RootStore({
      wsUrl: 'ws://test/ws',
      apiBaseUrl: '/api',
      fetchImpl: fakeFetch(),
      adapterFactory: () => new FakeSocketAdapter({ closeOnConnect: { code: 1006, reason: 'unauthorized' } }),
      heartbeat: false,
      reconnect: { enabled: false },
      autoRefreshMetricsMs: 0,
    });
    await expect(root.login('alice', 'secret')).resolves.toBe(true);
    expect(root.connection.state).toBe('failed');
    expect(root.toast.toasts.length).toBeGreaterThan(0);
    root.dispose();
  });
});

describe('RootStore · 会话生命周期', () => {
  it('bootstrap 无 token → 不连接', async () => {
    const { root, harness } = makeRoot(PANEL_HANDLER);
    await root.bootstrap();
    expect(root.session.isAuthenticated).toBe(false);
    expect(harness.adapters).toHaveLength(0);
    root.dispose();
  });

  it('bootstrap 有 token → 连接并拉面板', async () => {
    const storage = new MemoryStorage();
    storage.setItem(TOKEN_STORAGE_KEY, 'jwt-restored');
    storage.setItem(USER_STORAGE_KEY, JSON.stringify({ id: 7, username: 'alice' }));
    const { root, harness } = makeRoot(PANEL_HANDLER, { storage });
    await root.bootstrap();
    expect(root.connection.state).toBe('online');
    expect(harness.urls()[0]).toContain('token=jwt-restored');
    expect(root.item.items).toHaveLength(1);
    root.dispose();
  });

  it('logout 断连并清空存储', async () => {
    const storage = new MemoryStorage();
    const { root } = makeRoot(PANEL_HANDLER, { storage });
    await root.login('alice', 'secret');
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('jwt-1');
    root.logout();
    expect(root.session.isAuthenticated).toBe(false);
    expect(root.connection.state).toBe('closed');
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    root.dispose();
  });

  it('setPage 边界：非法页码忽略，合法页码改页并重拉', async () => {
    const { root } = makeRoot(PANEL_HANDLER);
    await root.login('alice', 'secret');
    root.item.setPage(Number.NaN);
    expect(root.item.page).toBe(1);
    root.item.setPage(0);
    expect(root.item.page).toBe(1);
    root.item.setPage(2);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(root.item.page).toBe(2);
    root.dispose();
  });
});
