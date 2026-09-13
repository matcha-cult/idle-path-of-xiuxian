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

interface MakeOptions {
  /** characterId：默认 11；null = 该 userId 没有角色 */
  characterId?: number | null;
  context?: ZoneOnlineContext | null;
  node?: { nodeCode: string; nodeName: string; idleUnlocked: boolean } | null;
  sessions?: OnlineSessionService;
  now?: () => number;
}

function makeService(options: MakeOptions = {}) {
  const {
    characterId = 11,
    context: ctx = context(),
    node = { nodeCode: 'qy_peak_xunlian', nodeName: '第八峰·历练', idleUnlocked: false },
    sessions = new OnlineSessionService(null, { heartbeatTtlMs: 60_000 }),
    now,
  } = options;
  const characterService = {
    findByUserId: stub(async (_userId: number) =>
      characterId === null ? null : { id: characterId, userId: _userId, realm: 5 },
    ),
  };
  const zoneService = { onlineContext: stub(async () => ctx) };
  const mapLogic = { secretRealmNodeView: stub(async () => node) };
  const service = new OnlineExploreService(
    sessions,
    characterService as never,
    zoneService as never,
    mapLogic as never,
    now === undefined ? {} : { now },
  );
  return { service, sessions, characterService, zoneService, mapLogic };
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
    assert.equal(service.stateOf(11)?.floorKills, 0);
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
