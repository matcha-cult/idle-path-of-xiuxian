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

  it('地图端到端（P2.0）：20×20 坐标 / 17 枢纽全量下发 / 4 山门可前往 / 相邻与对象层', async () => {
    const username = `webmap_${Date.now()}`;
    root = new RootStore({
      wsUrl: `ws://127.0.0.1:${port}/ws`,
      apiBaseUrl: `http://127.0.0.1:${port}/api`,
      storage: new MemoryStorage(),
      heartbeat: { intervalMs: 0, timeoutMs: 900 },
      reconnect: { enabled: false, baseDelayMs: 100, maxDelayMs: 500 },
      autoRefreshMetricsMs: 0,
    });
    await expect(root.register(username, 'secret123')).resolves.toBe(true);
    await expect(root.createCharacter('画布道友', 'male')).resolves.toBe(true);
    await root.map.load();

    const map = root.map.maps.find((entry) => entry.code === 'map_qingyun');
    expect(map, '青云宗必须在已解锁地图里').toBeDefined();
    // 坐标空间必须随 DTO 下发（漏改 SELECT 的经典故障：这里会拿到 undefined / NaN）
    expect(map?.gridRows).toBe(20);
    expect(map?.gridCols).toBe(20);
    expect(map?.backgroundKey).toBeNull();

    // 全量下发：17 枢纽（四门 + 八峰 + 四院 + 主峰）一开始就全在（v3 取代「未发现不下发」）
    expect(root.map.nodes).toHaveLength(17);
    expect(root.map.nodes.filter((n) => n.ring === 'peaks')).toHaveLength(8);
    expect(root.map.nodes.filter((n) => n.ring === 'inner')).toHaveLength(4);
    expect(root.map.nodes.find((n) => n.code === 'qy_summit')).toBeDefined();

    for (const node of root.map.nodes) {
      expect(Number.isInteger(node.gridRow), `${node.name} 缺 gridRow`).toBe(true);
      expect(Number.isInteger(node.gridCol), `${node.name} 缺 gridCol`).toBe(true);
      expect(node.gridRow).toBeGreaterThanOrEqual(0);
      expect(node.gridCol).toBeGreaterThanOrEqual(0);
      expect(node.gridRow).toBeLessThanOrEqual(map?.gridRows ?? 0);
      expect(node.gridCol).toBeLessThanOrEqual(map?.gridCols ?? 0);
      expect(typeof node.adjacent, `${node.name} 缺 adjacent`).toBe('boolean');
      // 风味文案本轮落库（悬停卡 / 右栏详情用）
      expect(typeof node.description).toBe('string');
      // 已发现列表本轮必含新结构的四个环层
    }

    // 新角色：currentNodeCode=null，可前往的恰好 4 个山门（入口规则）
    expect(map?.currentNodeCode ?? root.map.currentCode).toBeNull();
    const adjacentCodes = root.map.nodes.filter((n) => n.adjacent).map((n) => n.code).sort();
    expect(adjacentCodes).toEqual(['qy_gate_e', 'qy_gate_n', 'qy_gate_s', 'qy_gate_w']);

    // 对象层：11 个职能入口全量下发，宿主限四院 / 主峰
    expect(map?.objects).toHaveLength(11);
    expect(map?.objects.some((o) => o.nodeCode === 'qy_baigongyuan' && o.name === '百器阁')).toBe(true);

    // enter 东门 -> currentCode 更新；相邻集合 = 四门 ∪ 东门两邻峰（第六 / 第七峰）
    await root.map.enter('qy_gate_e');
    expect(root.map.currentCode).toBe('qy_gate_e');
    const afterEnter = root.map.nodes.filter((n) => n.adjacent).map((n) => n.code);
    expect(afterEnter).toContain('qy_peak_6');
    expect(afterEnter).toContain('qy_peak_7');

    // 不相邻且非山门 -> 服务端 NODE_NOT_ADJACENT（位置不变，业务失败只走 toast）
    await root.map.enter('qy_peak_3');
    expect(root.map.currentCode).toBe('qy_gate_e');

    // 传送点：从未到达的西门 -> 业务失败；已到达的东门 -> 成功且更新位置
    await root.map.waypoint('qy_gate_w');
    expect(root.map.currentCode).toBe('qy_gate_e');
    await root.map.waypoint('qy_gate_e');
    expect(root.map.currentCode).toBe('qy_gate_e');
  }, 45_000);
});
