// @vitest-environment node
/**
 * 真实后端端到端（**默认跳过**，需 `IONET_E2E=1` 且后端在 3000 端口运行）。
 *
 * 覆盖 T3 的完整前端链路：REST 注册/登录 → `?token=` 握手 → 应用层心跳
 * → 并发拉面板 → 建角 → 业务失败 Toast。使用真实 WebSocket（Node 24 内置）
 * 与真实 fetch，Store 层与浏览器运行的是同一份代码。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ZONE_CMD, type ZoneOnlineData } from '@idle-path/ionet-transport';
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

    // §22：怪物数据整体离开地图层 —— 17 个枢纽的 level/threshold/zoneCode 全为 null
    // （旧断言是「只有 qy_peak_xunlian 带 level=5/threshold=75」，随秘境与地图解耦作废）
    const withCombat = root.map.nodes.filter((n) => n.level !== null || n.threshold !== null);
    expect(withCombat.map((n) => n.code)).toEqual([]);
    for (const node of root.map.nodes) {
      expect(node.level, `${node.name} 的怪物境界应为 null`).toBeNull();
      expect(node.threshold, `${node.name} 的门槛应为 null`).toBeNull();
      expect(node.zoneCode, `${node.name} 不应再挂 zoneCode`).toBeNull();
    }

    // §22：第八峰·后山降级为「秘境入口」地点（route + featureKey=realm + 新名字）
    const realmEntrance = root.map.nodes.find((n) => n.code === 'qy_peak_xunlian');
    expect(realmEntrance?.name).toBe('第八峰·后山');
    expect(realmEntrance?.kind).toBe('route');
    expect(realmEntrance?.featureKey).toBe('realm');

    // 新角色：currentNodeCode=null，可前往的恰好 4 个山门（入口规则）
    expect(map?.currentNodeCode ?? root.map.currentCode).toBeNull();
    const adjacentCodes = root.map.nodes.filter((n) => n.adjacent).map((n) => n.code).sort();
    expect(adjacentCodes).toEqual(['qy_gate_e', 'qy_gate_n', 'qy_gate_s', 'qy_gate_w']);

    // 对象层：12 个职能入口全量下发（§22 起含第八峰·后山的「秘境石台」），宿主限白名单
    expect(map?.objects).toHaveLength(12);
    expect(map?.objects.some((o) => o.nodeCode === 'qy_baigongyuan' && o.name === '百器阁')).toBe(true);
    expect(map?.objects.some((o) => o.code === 'obj_mijing_shitai' && o.featureKey === 'realm')).toBe(true);

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

  /**
   * P3.0 在线历练端到端（T8 实测口径；§22 修订）。
   *
   * 覆盖任务书 §9 第 6 条要的全部数字：连续 10 tick 的击杀累计、涨层时刻、
   * 离线（hidden）时 tick 不推进、推送次数（证明节流）、`realm_unlocked` 置位（首周目打满 ⇒ clears≥1）。
   * 用 5 境裸装战力 100：层门槛 75/87/99 → r = 1.33 / 1.15 / 1.01，全程可推进。
   */
  it('历练峰在线打怪升阶（P3.0）：10 tick 击杀 / 涨层 / 节流 / 离线暂停 / 突破秘境', async () => {
    const username = `webonline_${Date.now()}`;
    root = new RootStore({
      wsUrl: `ws://127.0.0.1:${port}/ws`,
      apiBaseUrl: `http://127.0.0.1:${port}/api`,
      storage: new MemoryStorage(),
      heartbeat: { intervalMs: 1000, timeoutMs: 2000 },
      reconnect: { enabled: true, baseDelayMs: 100, maxDelayMs: 500 },
      autoRefreshMetricsMs: 0,
    });
    await expect(root.register(username, 'secret123')).resolves.toBe(true);
    await expect(root.createCharacter('历练道友', 'male')).resolves.toBe(true);

    // 推送帧计数（证明节流：不该每 tick 一条）
    const pushed: ZoneOnlineData[] = [];
    root.client.notifications.onAny((frame) => {
      if (frame.cmd === ZONE_CMD.cmd && frame.subCmd === ZONE_CMD.online) {
        pushed.push(frame.data as ZoneOnlineData);
      }
    });

    // 1) 练到 5 境（裸装战力 100）：注入灵韵 + 连续突破
    await root.skill.grantLingyun(20000);
    for (let i = 0; i < 6 && (root.session.character?.realm ?? 1) < 5; i++) {
      await root.realm.breakthrough();
    }
    expect(root.session.character?.realm).toBe(5);

    // 2) 突破历练秘境（§22：training 免费放行；`zone.enter` 只允许**已突破**的重复挑战）
    //    §22 种子把旧 `zone_houshan`（历练峰）换成 13 境各自的秘境：门槛 75/87/99 对应 `zone_r4`
    //    （basePower 75 / powerStep 12 / maxFloor 3），与下方 r = 1.33 / 1.15 / 1.01 的假设一致。
    await root.zone.startBreakthrough('zone_r4');
    await root.zone.loadOnline();
    expect(root.zone.online?.reason).toBe('ok');
    // TODO(T9): 真后端 e2e 待重跑（§22 后帧里只有 zone{code,name,realm}，没有 nodeName）
    expect(root.zone.online?.zone?.code).toBe('zone_r4');
    expect(root.zone.online?.floorRequirement).toBe(75);
    expect(root.zone.online?.playerPower).toBe(100);
    // §22：新角色第一周目，尚未突破
    expect(root.zone.online?.clears).toBe(0);

    // 3) 连续 10 个 tick：每 tick 采样一次 floorKills（1s 节拍）
    const samples: number[] = [root.zone.online?.floorKills ?? 0];
    for (let i = 0; i < 10; i++) {
      await sleep(1000);
      await root.zone.loadOnline();
      samples.push(root.zone.online?.floorKills ?? 0);
    }
    const kills10 = (samples.at(-1) ?? 0) - (samples[0] ?? 0);
    console.log('[P3.0 实测] 10 tick 采样 floorKills:', samples.join(' → '), '⇒ 累计击杀', kills10);
    expect(kills10).toBeGreaterThanOrEqual(12); // r=1.33：10 秒约 13 只
    expect(kills10).toBeLessThanOrEqual(14);
    console.log('[P3.0 实测] 10 秒内推送帧数:', pushed.length, '（节流上限 4）');
    expect(pushed.length).toBeLessThanOrEqual(Math.ceil(10_000 / 3000));

    // 4) 离线不推进（硬证据）：此刻第 1 层正以约 1.33 只/秒累计，
    //    页面不可见（hidden 上报）后 6 秒，本层击杀必须一动不动
    const beforeHiddenKills = root.zone.online?.floorKills ?? 0;
    const beforeHiddenFloor = root.zone.online?.floor ?? 0;
    expect(beforeHiddenKills).toBeGreaterThan(0);
    root.zone.reportVisibility(false);
    await sleep(1500);
    await root.zone.loadOnline();
    expect(root.zone.online?.reason).toBe('hidden');
    expect(root.zone.online?.online).toBe(false);
    await sleep(6000);
    await root.zone.loadOnline();
    const afterHiddenKills = root.zone.online?.floorKills ?? -1;
    console.log(
      '[P3.0 实测] hidden 6 秒前后：本层击杀',
      beforeHiddenKills,
      '→',
      afterHiddenKills,
      '/ 层',
      beforeHiddenFloor,
      '→',
      root.zone.online?.floor,
      '/ online=',
      root.zone.online?.online,
    );
    expect(afterHiddenKills).toBe(beforeHiddenKills);
    expect(root.zone.online?.floor).toBe(beforeHiddenFloor);
    // 切回可见 → 立刻恢复推进
    root.zone.reportVisibility(true);
    await sleep(2500);
    await root.zone.loadOnline();
    expect(root.zone.online?.reason).toBe('ok');
    expect(root.zone.online?.floorKills ?? 0).toBeGreaterThanOrEqual(beforeHiddenKills);

    // 5) 涨层：从第 1 层打到打满整轮（3 层）
    //    §22：打满即**自动退出**并突破（clears 0→1）——终帧只在推送里出现，
    //    自动退出之后的读接口只剩 no_battle 帧，所以两处都收。
    const start = Date.now();
    const floorMarks: string[] = [];
    let lastFloor = root.zone.online?.floor ?? 1;
    let terminal: ZoneOnlineData | null = pushed.find((f) => f.cleared) ?? null;
    for (let i = 0; i < 150 && terminal === null; i++) {
      await sleep(1000);
      await root.zone.loadOnline();
      terminal = pushed.find((f) => f.cleared) ?? terminal;
      const frame = root.zone.online;
      if (frame === null) continue;
      if (frame.floor !== lastFloor || frame.cleared) {
        floorMarks.push(`第${frame.floor}层@${Math.round((Date.now() - start) / 1000)}s`);
        lastFloor = frame.floor;
      }
      if (frame.cleared) terminal = frame;
      if (i % 15 === 0) {
        console.log(
          `[P3.0 实测] 涨层循环 +${i}s 层=${frame.floor}/${frame.maxFloor} 本层击杀=${frame.floorKills}/${frame.killsPerFloor} 门槛=${frame.floorRequirement} 卡层=${frame.stuck}`,
        );
      }
    }
    console.log('[P3.0 实测] 涨层/通关时刻:', floorMarks.join(', '));

    // 6) §22：打满整轮 ⇒ 该秘境被突破（clears ≥ 1），且服务端已自动把玩家请出秘境
    // TODO(T9): 真后端 e2e 待重跑（旧断言 idleUnlocked=true 已被 §22 的 clears ≥ 1 取代）
    expect(terminal, '必须观测到「本轮已打满」的终帧').not.toBeNull();
    expect(terminal?.cleared).toBe(true);
    expect(terminal?.clears ?? 0).toBeGreaterThanOrEqual(1);
    console.log('[P3.0 实测] 突破后终帧：', JSON.stringify({
      floor: terminal?.floor,
      cleared: terminal?.cleared,
      clears: terminal?.clears,
      reason: terminal?.reason,
    }));

    // 7) 突破事件在推送帧里出现过（前端据此弹提示）。
    //    读接口先于推送看到 DB 变化，而推送按 pushEveryMs 节流 —— 必须等一个节流窗口。
    await sleep(4000);
    const eventHistogram = pushed.flatMap((f) => f.events).reduce<Record<string, number>>((acc, e) => {
      acc[e] = (acc[e] ?? 0) + 1;
      return acc;
    }, {});
    console.log('[P3.0 实测] 推送帧总数:', pushed.length, '/ 事件直方图:', JSON.stringify(eventHistogram));
    expect(pushed.some((f) => f.events.includes('realm_unlocked'))).toBe(true);
    expect(eventHistogram.realm_unlocked).toBe(1); // 幂等：突破只推一次

    // 8) §22 收尾验证：突破之后的四件事（复用同一角色，几乎零额外耗时）
    //    8a) Q4：突破成功才出现在秘境页面 —— catalog 的 `zones` 必须含 zone_r4，
    //        而 `breakthrough` 名录里它的 cleared 也翻成 true
    await root.zone.load();
    expect(root.zone.zones.map((z) => z.code)).toContain('zone_r4');
    expect(root.zone.zones.find((z) => z.code === 'zone_r4')?.progress.clears ?? 0).toBeGreaterThanOrEqual(1);
    expect(root.zone.breakthrough.find((z) => z.code === 'zone_r4')?.cleared).toBe(true);

    //    8b) 已突破的历练秘境可设为挂机点（§22 Q5：只有可反复挑战的才能挂机）
    await root.zone.setIdleTarget('zone_r4');
    expect(root.zone.idleTarget).toBe('zone_r4');

    //    8c) **不在战斗中** → 挂机不被互斥闸门拦住（此刻无离线时长，走「暂无可结算收益」）
    await root.idle.settle();
    expect(root.idle.error ?? '').not.toContain('在线战斗中');

    //    8d) 重复挑战（Q1「可重复挑战」）：enter 成功，并把**新一轮**的层数重置回第 1 层；
    //        clears 是只增的周目计数，不回退
    await root.zone.enter('zone_r4');
    await root.zone.loadOnline();
    expect(root.zone.online?.reason).toBe('ok');
    expect(root.zone.online?.floor).toBe(1);
    expect(root.zone.online?.clears ?? -1).toBeGreaterThanOrEqual(1);

    //    8e) 反向互斥（Q6）：战斗中挂机结算必须被拒
    await root.idle.settle();
    expect(root.idle.error ?? '').toContain('在线战斗中');

    //    8f) 手动离开 → 回到无战斗状态（挂机随之恢复）
    await root.zone.leave();
    await root.zone.loadOnline();
    expect(root.zone.online?.reason).toBe('no_battle');

    //    8g) §23 A3：挂机改「循环整轮」—— 显式给 1 小时离线时长（dev 专用 override），
    //        真后端必须按 1..maxFloor 逐层结算，而不是把击杀全砸在 Boss 层。
    //        1 小时 × 60 轮/时 × 60% = 36 杀；3 层 ⇒ 每层 12 杀。
    await root.idle.settle({ hours: 1 });
    const settle = root.idle.lastSettle;
    expect(settle?.kills).toBe(36);
    expect(settle?.zone).toEqual({ code: 'zone_r4', name: expect.any(String), maxFloor: 3 });
    expect(settle?.floors.map((entry) => entry.floor)).toEqual([1, 2, 3]);
    expect(settle?.floors.map((entry) => entry.kills)).toEqual([12, 12, 12]);
    // 逐层单位各不相同（第 3 层是 Boss 层），单位名必须都能取到
    expect(settle?.floors.map((entry) => entry.isBoss)).toEqual([false, false, true]);
    expect(new Set(settle?.floors.map((entry) => entry.unitName)).size).toBeGreaterThanOrEqual(2);
    expect(root.idle.error).toBeNull();
    console.log(
      `[§23 A3 实测] idle.settle(hours=1) ⇒ kills=${settle?.kills} zone=${settle?.zone?.name} ` +
        `floors=${JSON.stringify(settle?.floors.map((f) => [f.floor, f.unitName, f.isBoss, f.kills]))} ` +
        `lingyun+${settle?.lingyunGained} items=${settle?.itemsProduced}`,
    );

    //    8h) §23 B2：自动结算只做一次 —— 本会话早已结算过，再触发不产生新结果
    const before = root.idle.lastSettle;
    await root.idle.autoSettle();
    expect(root.idle.lastSettle).toBe(before);
  }, 300_000);
});
