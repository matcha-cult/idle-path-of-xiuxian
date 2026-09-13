/**
 * OnlineExploreService 边界测试（P3.0 T3 骨架口径）。
 *
 * T3 只覆盖：受管定时器生命周期、在线枚举与**同角色去重**、无角色 / 无秘境 / 非秘境峰
 * 的分流、面板读帧（`snapshot`）的五种 reason、重入保护、内存治理。
 * 击杀 / 涨层 / 推送的边界在 T4 / T5 的用例里补。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  OnlineExploreService,
  type OnlineCharacterState,
} from '../../../src/modules/logic/zone/internal/online-explore.service.js';
import { ONLINE_TICK } from '../../../src/modules/logic/zone/internal/online-tick.config.js';
import type { ZoneOnlineContext } from '../../../src/modules/logic/zone/internal/zone.types.js';
import { OnlineNotifyService } from '../../../src/modules/logic/zone/internal/online-notify.service.js';
import { OnlineSessionService } from '../../../src/modules/online/online-session.service.js';
import { stub } from '../../helpers/stub.js';

function context(overrides: Partial<ZoneOnlineContext> = {}): ZoneOnlineContext {
  return {
    zoneId: 5,
    zoneCode: 'zone_houshan',
    zoneName: '后山历练峰',
    maxFloor: 3,
    floor: 1,
    bestFloor: 0,
    cleared: false,
    playerPower: 100,
    floorRequirement: 75,
    isBossFloor: false,
    unitCode: 'u_r5_tongmo',
    lingyunBonusFlat: 10,
    tierOffsetBonus: 0,
    dropDrawBonus: 0,
    ...overrides,
  };
}

/** 暴露 protected 的单角色一拍，便于逐拍断言事件与帧。 */
class TestableOnlineExploreService extends OnlineExploreService {
  runOne(userId: number, characterId: number, realm: number, at: number) {
    return this.tickCharacter(userId, characterId, realm, at);
  }
}

interface MakeOptions {
  /** characterId：默认 11；null = 该 userId 没有角色 */
  characterId?: number | null;
  context?: ZoneOnlineContext | null;
  node?: { nodeCode: string; nodeName: string; idleUnlocked: boolean } | null;
  sessions?: OnlineSessionService;
  now?: () => number;
  /** settleKills 的返回；缺省成功且给 3 灵韵 */
  settle?: unknown;
  /** 推送服务替身；缺省记录调用的 stub */
  notifier?: unknown;
}

function makeService(options: MakeOptions = {}) {
  const {
    characterId = 11,
    context: ctx = context(),
    node = { nodeCode: 'qy_peak_xunlian', nodeName: '第八峰·历练', idleUnlocked: false },
    sessions = new OnlineSessionService(null, { heartbeatTtlMs: 60_000 }),
    now,
    settle = { ok: true, data: { lingyunGained: 3 } },
    notifier = { record: stub(() => true), flush: stub(() => false), forget: stub(() => undefined) },
  } = options;
  const characterService = {
    findByUserId: stub(async (_userId: number) =>
      characterId === null ? null : { id: characterId, userId: _userId, realm: 5 },
    ),
  };
  const zoneService = {
    onlineContext: stub(async () => ctx),
    advanceFloor: stub(async () => ({ floor: 2, bestFloor: 1, cleared: false })),
  };
  const combatLogic = { settleKills: stub(async () => settle) };
  const mapLogic = {
    secretRealmNodeView: stub(async () => node),
    onZoneFloorPassed: stub(async () => ({ changed: false, nodeCode: 'qy_peak_xunlian', reason: 'not_boss' })),
  };
  const service = new TestableOnlineExploreService(
    sessions,
    characterService as never,
    zoneService as never,
    combatLogic as never,
    mapLogic as never,
    notifier as never,
    now === undefined ? {} : { now },
  );
  return { service, sessions, characterService, zoneService, combatLogic, mapLogic, notifier };
}

/**
 * 有状态的秘境替身：门槛 75/87/99、第 3 层 Boss、3 层（与 `zone_houshan` 种子一致）。
 * `advanceFloor` 复制真实实现的语义（通关时 floor 不越过 maxFloor）。
 */
function realmHarness(options: { playerPower: number; maxFloor?: number; bossEvery?: number } = { playerPower: 100 }) {
  const maxFloor = options.maxFloor ?? 3;
  const bossEvery = options.bossEvery ?? 3;
  let floor = 1;
  let best = 0;
  let cleared = false;
  const requirementOf = (f: number): number => 75 + (f - 1) * 12;
  const isBoss = (f: number): boolean => bossEvery > 0 && f % bossEvery === 0;
  return {
    get floor() {
      return floor;
    },
    get bestFloor() {
      return best;
    },
    get cleared() {
      return cleared;
    },
    contextOf: () =>
      context({
        floor,
        bestFloor: best,
        cleared,
        maxFloor,
        playerPower: options.playerPower,
        floorRequirement: requirementOf(floor),
        isBossFloor: isBoss(floor),
        unitCode: isBoss(floor) ? 'u_boss_yaowang' : 'u_r5_tongmo',
        lingyunBonusFlat: floor * 10,
      }),
    advanceFloor: async (
      _characterId: number,
      _zoneId: number,
      input: { floor: number; bestFloor: number; maxFloor: number },
    ) => {
      const next = input.floor + 1;
      cleared = next > input.maxFloor;
      const stored = cleared ? input.maxFloor : next;
      best = Math.max(best, input.floor);
      floor = stored;
      return { floor: stored, bestFloor: best, cleared };
    },
  };
}

describe('OnlineExploreService · 受管定时器（T3）', () => {
  test('onModuleInit 按 ONLINE_TICK.tickMs 起 interval；onModuleDestroy 停且幂等', (t) => {
    const setIntervalMock = t.mock.method(globalThis, 'setInterval');
    const clearIntervalMock = t.mock.method(globalThis, 'clearInterval');
    const { service } = makeService();

    service.onModuleInit();
    assert.equal(setIntervalMock.mock.callCount(), 1);
    assert.equal(setIntervalMock.mock.calls[0]?.arguments[1], ONLINE_TICK.tickMs);

    service.onModuleDestroy();
    assert.equal(clearIntervalMock.mock.callCount(), 1);
    service.onModuleDestroy();
    assert.equal(clearIntervalMock.mock.callCount(), 1, '重复 destroy 不重复 clear');
  });

  test('未 init 直接 destroy 不抛（生命周期乱序安全）', () => {
    const { service } = makeService();
    assert.doesNotThrow(() => service.onModuleDestroy());
  });
});

describe('OnlineExploreService · 在线枚举与去重（T3）', () => {
  test('没有在线会话：一拍什么都不做，报告为零', async () => {
    const { service, zoneService } = makeService();
    const report = await service.runTick(1_000);
    assert.deepEqual(report, { at: 1_000, onlineUsers: 0, processed: 0, noCharacter: 0 });
    assert.equal(zoneService.onlineContext.callCount, 0);
  });

  test('一个在线会话 → processed 1，并建立会话内进度', async () => {
    const { service, sessions, zoneService } = makeService();
    sessions.touch(7, 0);
    const report = await service.runTick(1_000);
    assert.equal(report.onlineUsers, 1);
    assert.equal(report.processed, 1);
    assert.equal(zoneService.onlineContext.callCount, 1);
    // T4 起同一拍就会结算：r=100/75 → 首拍 1 只
    assert.equal(service.stateOf(11)?.floorKills, 1);
  });

  test('页面不可见（hidden）→ 不算在线，一拍不推进（R2 §4.2 第二条腿）', async () => {
    const { service, sessions, zoneService } = makeService();
    sessions.touch(7, 0);
    sessions.setVisible(7, false, 0);
    const report = await service.runTick(1_000);
    assert.equal(report.onlineUsers, 0);
    assert.equal(zoneService.onlineContext.callCount, 0);
    assert.equal(service.stateOf(11), null);
  });

  test('判死（超过心跳 TTL）→ 一拍不推进（离线不推进）', async () => {
    const { service, sessions, zoneService } = makeService();
    sessions.touch(7, 0);
    const report = await service.runTick(60_001);
    assert.equal(report.onlineUsers, 0);
    assert.equal(zoneService.onlineContext.callCount, 0);
  });

  test('有在线会话但没有角色 → noCharacter 计数，不崩', async () => {
    const { service, sessions } = makeService({ characterId: null });
    sessions.touch(7, 0);
    const report = await service.runTick(1_000);
    assert.equal(report.onlineUsers, 1);
    assert.equal(report.processed, 0);
    assert.equal(report.noCharacter, 1);
  });

  test('同一角色多会话同时在线 → 只推进一次（不翻倍）', async () => {
    const { service, sessions, zoneService } = makeService({ characterId: 11 });
    sessions.touch(7, 0);
    sessions.touch(8, 0);
    sessions.touch(9, 0);
    const report = await service.runTick(1_000);
    assert.equal(report.onlineUsers, 3);
    assert.equal(report.processed, 1);
    assert.equal(zoneService.onlineContext.callCount, 1, '同角色只查一次上下文');
  });

  test('未进入任何秘境（onlineContext 为 null）→ 不建状态、不报错', async () => {
    const { service, sessions, mapLogic } = makeService({ context: null });
    sessions.touch(7, 0);
    const report = await service.runTick(1_000);
    assert.equal(report.processed, 1);
    assert.equal(service.stateOf(11), null);
    assert.equal(mapLogic.secretRealmNodeView.callCount, 0);
  });

  test('当前秘境不是「地图上的历练秘境峰」→ 同样不推进', async () => {
    const { service, sessions } = makeService({ node: null });
    sessions.touch(7, 0);
    await service.runTick(1_000);
    assert.equal(service.stateOf(11), null);
  });

  test('重入保护：上一拍未结束则本次 tick 返回 null（不并发写同一角色）', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service, sessions, zoneService } = makeService();
    sessions.touch(7, 0);
    zoneService.onlineContext = stub(async () => {
      await gate;
      return context();
    }) as never;
    const first = service.tick(1_000);
    const second = await service.tick(1_000);
    assert.equal(second, null);
    release();
    const report = await first;
    assert.equal(report?.processed, 1);
  });
});

describe('OnlineExploreService · 面板读帧 snapshot（T3/T5）', () => {
  test('会话判死 → reason=no_session、online=false', async () => {
    const { service } = makeService();
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.online, false);
    assert.equal(frame.exploring, false);
    assert.equal(frame.reason, 'no_session');
    assert.equal(frame.zone, null);
    assert.equal(frame.floor, 0);
  });

  test('会话活着但页面不可见 → reason=hidden、online=false', async () => {
    const { service, sessions } = makeService();
    sessions.touch(7, 0);
    sessions.setVisible(7, false, 0);
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.online, false);
    assert.equal(frame.reason, 'hidden');
  });

  test('在线但未进入秘境 → reason=no_realm', async () => {
    const { service, sessions } = makeService({ context: null });
    sessions.touch(7, 0);
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.online, true);
    assert.equal(frame.exploring, false);
    assert.equal(frame.reason, 'no_realm');
  });

  test('在线但该秘境没挂地图节点（遗留秘境）→ reason=not_map_realm，仍带 zone 信息', async () => {
    const { service, sessions } = makeService({ node: null });
    sessions.touch(7, 0);
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.reason, 'not_map_realm');
    assert.equal(frame.zone?.code, 'zone_houshan');
    assert.equal(frame.maxFloor, 3);
    assert.equal(frame.floor, 1);
  });

  test('在线 + 秘境峰 → exploring=true，门槛 / 卡层 / 层进度都对', async () => {
    const { service, sessions } = makeService({
      context: context({ playerPower: 80, floorRequirement: 87, floor: 2, bestFloor: 1 }),
      node: { nodeCode: 'qy_peak_xunlian', nodeName: '第八峰·历练', idleUnlocked: true },
    });
    sessions.touch(7, 0);
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.exploring, true);
    assert.equal(frame.reason, 'ok');
    assert.equal(frame.zone?.name, '后山历练峰');
    assert.equal(frame.nodeName, '第八峰·历练');
    assert.equal(frame.floor, 2);
    assert.equal(frame.maxFloor, 3);
    assert.equal(frame.floorRequirement, 87);
    assert.equal(frame.playerPower, 80);
    assert.equal(frame.stuck, true);
    assert.equal(frame.shortfall, 7);
    assert.equal(frame.killsPerFloor, ONLINE_TICK.killsPerFloor);
    assert.equal(frame.idleUnlocked, true);
    assert.equal(frame.floorKills, 0);
    assert.deepEqual(frame.events, []);
    assert.equal(frame.kills, 0);
  });

  test('恰好等于门槛不算卡层（§6.1 是 ≥）；远超门槛 shortfall=0', async () => {
    const { service, sessions } = makeService({
      context: context({ playerPower: 75, floorRequirement: 75 }),
    });
    sessions.touch(7, 0);
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.stuck, false);
    assert.equal(frame.shortfall, 0);
  });

  test('战力 0 与门槛 0 的极值：不产生 NaN 上屏', async () => {
    const { service, sessions } = makeService({
      context: context({ playerPower: 0, floorRequirement: 0 }),
    });
    sessions.touch(7, 0);
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.stuck, false);
    assert.equal(frame.shortfall, 0);
    assert.ok(Number.isFinite(frame.playerPower));
    assert.ok(Number.isFinite(frame.floorRequirement));
  });

  test('snapshot 不消费产出摘要（kills / lingyunGained 恒 0）', async () => {
    const { service, sessions } = makeService();
    sessions.touch(7, 0);
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.kills, 0);
    assert.equal(frame.lingyunGained, 0);
  });
});

describe('OnlineExploreService · 会话进度内存治理', () => {
  test('超过 30 分钟没被 tick 碰过的状态被清掉（离线不保留任何累计）', async () => {
    const { service, sessions } = makeService();
    sessions.touch(7, 0);
    await service.runTick(0);
    const state = service.stateOf(11) as OnlineCharacterState;
    assert.ok(state !== null);
    sessions.forget(7);
    await service.runTick(31 * 60_000);
    assert.equal(service.stateOf(11), null);
  });

  test('30 分钟内仍保留（短暂断线不清空会话内进度）', async () => {
    const { service, sessions } = makeService();
    sessions.touch(7, 0);
    await service.runTick(0);
    sessions.forget(7);
    await service.runTick(29 * 60_000);
    assert.ok(service.stateOf(11) !== null);
  });
});

// ===== T4：在线结算六步 =====

describe('OnlineExploreService · 步 1/2：击杀速率与产出结算（T4）', () => {
  test('r=1（战力=门槛）：每 tick 1 只，settleKills 恰好收到 1 只与既有层加成', async () => {
    const { service, combatLogic } = makeService({ context: context({ playerPower: 75, floorRequirement: 75 }) });
    const frame = await service.runOne(7, 11, 5, 1_000);
    assert.equal(combatLogic.settleKills.callCount, 1);
    const [characterId, unitCode, count, options] = combatLogic.settleKills.last as [
      number,
      string,
      number,
      { lingyunBonusFlat: number; tierOffsetBonus: number; dropDrawBonus: number },
    ];
    assert.equal(characterId, 11);
    assert.equal(unitCode, 'u_r5_tongmo');
    assert.equal(count, 1);
    assert.deepEqual(options, { lingyunBonusFlat: 10, tierOffsetBonus: 0, dropDrawBonus: 0 });
    assert.equal(frame?.kills, 1);
    assert.equal(frame?.lingyunGained, 3);
    assert.equal(frame?.floorKills, 1);
  });

  test('Boss 层用 bossCode 结算（遭遇单位由既有 encounterForCharacter 口径给出）', async () => {
    const { service, combatLogic } = makeService({
      context: context({ floor: 3, isBossFloor: true, playerPower: 100, floorRequirement: 99, unitCode: 'u_boss_yaowang' }),
    });
    await service.runOne(7, 11, 5, 1_000);
    assert.equal((combatLogic.settleKills.last as unknown[])[1], 'u_boss_yaowang');
  });

  test('kills=0（首次 tick 不该发生，但防御性）→ 不触碰 DB', async () => {
    const { service, combatLogic } = makeService({ context: context({ playerPower: 0, floorRequirement: 999_999 }) });
    const frame = await service.runOne(7, 11, 5, 1_000);
    assert.equal(combatLogic.settleKills.callCount, 0);
    assert.equal(frame?.kills, 0);
    assert.equal(frame?.floorKills, 0);
  });

  test('10 拍累计击杀：r=1.333… 走小数进位，累计 13 只（不是 10）', async () => {
    const { service } = makeService({ context: context({ playerPower: 100, floorRequirement: 75 }) });
    for (let i = 0; i < 10; i++) await service.runOne(7, 11, 5, i * 1_000);
    assert.equal(service.stateOf(11)?.floorKills, 13);
  });

  test('settleKills 失败（单位不存在 / 不可击杀）→ 本拍返回 null，不涨层、不抛', async () => {
    const { service, zoneService, mapLogic } = makeService({
      settle: { ok: false, result: { success: false, message: '单位不存在', data: { code: 'UNIT_NOT_FOUND' } } },
    });
    const frame = await service.runOne(7, 11, 5, 1_000);
    assert.equal(frame, null);
    assert.equal(zoneService.advanceFloor.callCount, 0);
    assert.equal(mapLogic.onZoneFloorPassed.callCount, 0);
  });

  test('offline 无会话 → runTick 不结算（离线不推进、也不产出）', async () => {
    const { service, combatLogic } = makeService();
    await service.runTick(1_000);
    assert.equal(combatLogic.settleKills.callCount, 0);
  });
});

describe('OnlineExploreService · 步 3/4：涨层与 Boss 层闸门（T4）', () => {
  function harnessService(options: { playerPower: number; maxFloor?: number; bossEvery?: number } ) {
    const built = makeService();
    const harness = realmHarness(options);
    built.zoneService.onlineContext = stub(async () => harness.contextOf()) as never;
    built.zoneService.advanceFloor = stub(harness.advanceFloor) as never;
    return { ...built, harness };
  }

  test('恰好在第 30 只击杀时涨层：advanceFloor 一次、事件 floor_up、本层击杀清零', async () => {
    // playerPower=75 → r=1 → 一拍恰好 1 只，30 拍 = 30 只（边界好读）
    const { service, zoneService, harness } = harnessService({ playerPower: 75 });
    let last = null;
    for (let i = 0; i < 30; i++) last = await service.runOne(7, 11, 5, i * 1_000);
    assert.equal(zoneService.advanceFloor.callCount, 1);
    assert.equal(harness.floor, 2);
    assert.equal(last?.floor, 2);
    assert.equal(last?.floorKills, 0);
    assert.deepEqual(last?.events, ['floor_up']);
  });

  test('第 29 只时不涨层（边界：差 1 只）', async () => {
    const { service, zoneService, harness } = harnessService({ playerPower: 75 });
    for (let i = 0; i < 29; i++) await service.runOne(7, 11, 5, i * 1_000);
    assert.equal(zoneService.advanceFloor.callCount, 0);
    assert.equal(harness.floor, 1);
  });

  test('进入 Boss 层（第 3 层）发 boss_floor；门槛 99、playerPower 100 仍能打', async () => {
    const { service, harness } = harnessService({ playerPower: 100 });
    const events: string[] = [];
    for (let i = 0; i < 70; i++) {
      const frame = await service.runOne(7, 11, 5, i * 1_000);
      if (frame) events.push(...frame.events);
    }
    assert.ok(events.includes('floor_up'), '第 1 层 → 第 2 层');
    assert.ok(events.includes('boss_floor'), '第 2 层 → 第 3 层（Boss 层）');
    assert.equal(harness.floor, 3);
  });

  test('Boss 未被击败前停在 Boss 层（打不赢 → 原地刷、不涨层）', async () => {
    const built = makeService();
    // 第 3 层 Boss 门槛 99 > 战力 90 → 卡层
    const harness = realmHarness({ playerPower: 90 });
    built.zoneService.onlineContext = stub(async () => harness.contextOf()) as never;
    built.zoneService.advanceFloor = stub(harness.advanceFloor) as never;
    // 先把层推进到 3（模拟前面已打过）
    await harness.advanceFloor(11, 5, { floor: 1, bestFloor: 0, maxFloor: 3 });
    await harness.advanceFloor(11, 5, { floor: 2, bestFloor: 1, maxFloor: 3 });
    assert.equal(harness.floor, 3);
    for (let i = 0; i < 40; i++) await built.service.runOne(7, 11, 5, i * 1_000);
    assert.equal(built.zoneService.advanceFloor.callCount, 0, '卡层不涨层');
    assert.ok(
      built.combatLogic.settleKills.callCount >= 30 && built.combatLogic.settleKills.callCount <= 40,
      '卡层仍有产出（r<1 时部分拍只累计小数，不结算）',
    );
    assert.equal(built.service.stateOf(11)?.stuck, true);
  });

  test('击败 Boss：清层 + idle_unlocked 事件（解锁离线挂机，D2）', async () => {
    const built = makeService();
    const harness = realmHarness({ playerPower: 100 });
    built.zoneService.onlineContext = stub(async () => harness.contextOf()) as never;
    built.zoneService.advanceFloor = stub(harness.advanceFloor) as never;
    built.mapLogic.onZoneFloorPassed = stub(async () => ({
      changed: true,
      nodeCode: 'qy_peak_xunlian',
      reason: 'unlocked',
    })) as never;
    await harness.advanceFloor(11, 5, { floor: 1, bestFloor: 0, maxFloor: 3 });
    await harness.advanceFloor(11, 5, { floor: 2, bestFloor: 1, maxFloor: 3 });
    let last = null;
    for (let i = 0; i < 30; i++) last = await built.service.runOne(7, 11, 5, i * 1_000);
    assert.equal(harness.cleared, true);
    assert.equal(harness.floor, 3, '通关时 floor 不越过 maxFloor');
    assert.ok(last?.events.includes('boss_defeated'));
    assert.ok(last?.events.includes('idle_unlocked'));
    assert.equal(last?.idleUnlocked, true);
    assert.equal(last?.cleared, true);
    // 钩子收到的是「刚通过的 Boss 层」
    const event = (built.mapLogic.onZoneFloorPassed.last as unknown[])[1] as {
      zoneCode: string;
      floor: number;
      isBossFloor: boolean;
      cleared: boolean;
    };
    assert.deepEqual(event, { zoneCode: 'zone_houshan', floor: 3, isBossFloor: true, cleared: true });
  });

  test('解锁幂等：钩子返回 changed=false（此前已解锁）→ 不发 idle_unlocked', async () => {
    const built = makeService({
      node: { nodeCode: 'qy_peak_xunlian', nodeName: '第八峰·历练', idleUnlocked: true },
    });
    const harness = realmHarness({ playerPower: 100 });
    built.zoneService.onlineContext = stub(async () => harness.contextOf()) as never;
    built.zoneService.advanceFloor = stub(harness.advanceFloor) as never;
    built.mapLogic.onZoneFloorPassed = stub(async () => ({
      changed: false,
      nodeCode: 'qy_peak_xunlian',
      reason: 'already_unlocked',
    })) as never;
    let last = null;
    for (let i = 0; i < 30; i++) last = await built.service.runOne(7, 11, 5, i * 1_000);
    assert.ok(!(last?.events ?? []).includes('idle_unlocked'));
    assert.equal(last?.idleUnlocked, true, '已解锁状态照常展示');
  });

  test('通关后不再涨层（cleared 后原地刷最后层）', async () => {
    const built = makeService();
    const harness = realmHarness({ playerPower: 100, maxFloor: 1, bossEvery: 3 });
    built.zoneService.onlineContext = stub(async () => harness.contextOf()) as never;
    built.zoneService.advanceFloor = stub(harness.advanceFloor) as never;
    let last = null;
    for (let i = 0; i < 40; i++) last = await built.service.runOne(7, 11, 5, i * 1_000);
    assert.equal(built.zoneService.advanceFloor.callCount, 1, '只通关一次');
    assert.equal(harness.cleared, true);
    assert.equal(harness.floor, 1, 'maxFloor=1：floor 保持 1');
    assert.equal(last?.cleared, true);
    assert.equal(built.combatLogic.settleKills.callCount, 40, '通关后仍原地刷（r=4/3 每拍都有产出）');
  });

  test('maxFloor=1 且无普通层：直接通关，不出现 boss_floor（bossEvery=3 > maxFloor）', async () => {
    const built = makeService();
    const harness = realmHarness({ playerPower: 100, maxFloor: 1 });
    built.zoneService.onlineContext = stub(async () => harness.contextOf()) as never;
    built.zoneService.advanceFloor = stub(harness.advanceFloor) as never;
    const events: string[] = [];
    for (let i = 0; i < 31; i++) {
      const frame = await built.service.runOne(7, 11, 5, i * 1_000);
      if (frame) events.push(...frame.events);
    }
    assert.deepEqual(events, ['floor_up']);
  });

  test('卡层事件边沿触发：连续卡层 40 拍只报一次 stuck', async () => {
    const built = makeService({ context: context({ playerPower: 20, floorRequirement: 75 }) });
    let stuckCount = 0;
    for (let i = 0; i < 40; i++) {
      const frame = await built.service.runOne(7, 11, 5, i * 1_000);
      stuckCount += (frame?.events ?? []).filter((e) => e === 'stuck').length;
    }
    assert.equal(stuckCount, 1);
    assert.equal(built.zoneService.advanceFloor.callCount, 0);
    assert.equal(built.service.stateOf(11)?.floorKills, 20, '卡层也累计击杀（r=0.5 → 2 秒 1 只）');
  });

  test('卡层提示给出「还差 N」（用既有门槛公式，不另算）', async () => {
    const built = makeService({ context: context({ playerPower: 80, floorRequirement: 87 }) });
    const frame = await built.service.runOne(7, 11, 5, 1_000);
    assert.equal(frame?.stuck, true);
    assert.equal(frame?.shortfall, 7);
  });

  test('门槛 0（配置错误）走保守下界：不产生 Infinity 击杀', async () => {
    const built = makeService({ context: context({ playerPower: 100, floorRequirement: 0 }) });
    const frame = await built.service.runOne(7, 11, 5, 1_000);
    assert.ok((frame?.kills ?? 0) <= 1);
    assert.equal(frame?.stuck, false);
  });
});

// ===== T5：推送接线与节流 =====

describe('OnlineExploreService · 把帧交给推送服务（T5）', () => {
  test('每拍有产出就把帧交给 notifier（含 userId / characterId / 时钟）', async () => {
    const { service, sessions, notifier } = makeService();
    sessions.touch(7, 0);
    await service.runTick(1_000);
    const record = (notifier as { record: ReturnType<typeof stub> }).record;
    assert.equal(record.callCount, 1);
    const [userId, characterId, frame, at] = record.last as [number, number, { kills: number }, number];
    assert.equal(userId, 7);
    assert.equal(characterId, 11);
    assert.equal(frame.kills, 1);
    assert.equal(at, 1_000);
  });

  test('不推进（离线 / hidden）时完全不碰 notifier', async () => {
    const { service, sessions, notifier } = makeService();
    sessions.touch(7, 0);
    sessions.setVisible(7, false, 0);
    await service.runTick(1_000);
    assert.equal((notifier as { record: ReturnType<typeof stub> }).record.callCount, 0);
  });

  test('端到端节流：1 秒 tick 跑 10 秒，真实 OnlineNotifyService 只发 ≤4 次', async () => {
    const port = { broadcast: () => undefined, sendTo: () => true };
    const notifier = new OnlineNotifyService(port as never);
    const { service, sessions } = makeService({ notifier });
    sessions.touch(7, 0);
    for (let t = 0; t < 10_000; t += 1_000) await service.runTick(t);
    assert.ok(notifier.sentCount <= 4, `实际 ${notifier.sentCount} 次`);
    assert.ok(notifier.sentCount >= 3, `至少每 3 秒一帧，实际 ${notifier.sentCount}`);
  });

  test('未接推送服务（null）也不炸（@Optional 的降级路径）', async () => {
    const { service, sessions } = makeService({ notifier: null });
    sessions.touch(7, 0);
    await assert.doesNotReject(() => service.runTick(1_000));
  });
});
