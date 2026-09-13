// @vitest-environment node
/**
 * 真实后端端到端（**默认跳过**，需 `IONET_E2E=1` 且后端在 3000 端口运行）。
 *
 * 覆盖 T3 的完整前端链路：REST 注册/登录 → `?token=` 握手 → 应用层心跳
 * → 并发拉面板 → 建角 → 业务失败 Toast。使用真实 WebSocket（Node 24 内置）
 * 与真实 fetch，Store 层与浏览器运行的是同一份代码。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { RootStore } from '../src/app/root-store.js';
import type { StorageLike } from '../src/stores/session-store.js';

const ENABLED = process.env.IONET_E2E === '1';
const port = Number(process.env.PORT ?? 3000);

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!ENABLED)('真实后端 e2e（IONET_E2E=1）', () => {
  let root: RootStore | null = null;

  afterEach(() => {
    root?.dispose();
    root = null;
  });

  it('注册 → ?token= 连 WS → 建角 → 并发面板 → 心跳 → 业务失败 Toast', async () => {
    const username = `web_${Date.now()}`;
    root = new RootStore({
      wsUrl: `ws://127.0.0.1:${port}/ws`,
      apiBaseUrl: `http://127.0.0.1:${port}/api`,
      storage: new MemoryStorage(),
      heartbeat: { intervalMs: 1000, timeoutMs: 900 },
      reconnect: { enabled: true, baseDelayMs: 100, maxDelayMs: 500 },
      autoRefreshMetricsMs: 0,
    });

    // 1) 注册即登录：REST → JWT → ?token= 握手 → 并发拉面板
    await expect(root.register(username, 'secret123')).resolves.toBe(true);
    expect(root.connection.state).toBe('online');
    expect(root.session.isAuthenticated).toBe(true);

    // 未建角时各域返回 CHARACTER_NOT_FOUND（业务失败），面板不应因此抛错
    expect(root.toast.toasts.some((t) => t.code === 'CHARACTER_NOT_FOUND')).toBe(true);

    // 2) 建角后并发拉面板
    await expect(root.createCharacter('网页道友', 'male')).resolves.toBe(true);
    expect(root.session.hasCharacter).toBe(true);
    await root.loadPanel();

    expect(root.item.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(root.item.items)).toBe(true);
    expect(root.equip.equippedCount).toBeGreaterThanOrEqual(0);
    expect(root.realm.status?.realmName).toBeTypeOf('string');
    expect(Array.isArray(root.economy.currencies)).toBe(true);
    expect(Array.isArray(root.skill.catalog)).toBe(true);
    expect(root.idle.status).not.toBeNull();

    // 3) 业务失败 → Toast（不存在的物品）
    await root.item.loadDetail(999_999_999);
    expect(root.toast.toasts.some((t) => t.code === 'ITEM_NOT_FOUND')).toBe(true);

    // 4) 应用层心跳（system.ping (1,1)）
    await sleep(2600);
    root.connection.refreshMetrics();
    expect(root.connection.heartbeatAcks).toBeGreaterThanOrEqual(1);
    expect(root.connection.latencyMs).not.toBeNull();

    // 5) 心跳后连接仍可用
    await root.item.load();
    expect(root.item.error).toBeNull();
  }, 45_000);
});
