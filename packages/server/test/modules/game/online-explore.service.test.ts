/**
 * OnlineExploreService 边界测试（P3.0 T3-T7；§22 重做：在线 tick 与地图节点彻底解耦）。
 *
 * §22 相对 T3-T7 的口径变化（本文件全部按新契约断言）：
 * - 挂载点只看 `ZoneService.onlineContext`（`game_zone_state` 有行且指向存活的秘境）；
 *   **不再有** `mapLogic.secretRealmNodeView` 白名单；
 * - 涨层闸门 = `!context.cleared && floor <= maxFloor`（「本轮已打满」挡死防重复结算；
 *   `<=` 必须允许末层再涨一次 —— `advanceFloor` 正是靠 `floor === maxFloor` 判通关的，
 *   写成 `< maxFloor` 曾让「打满 → 自动退出 → 突破」整条路径成为死代码）；
 *   普通涨层后重读 `onlineContext`，只在「下一层是 Boss 层」时推 `boss_floor`；
 * - 踏满一轮（`advanceFloor` 返回 `cleared`）→ **自动 `leaveBattle`**（清 `game_zone_state` 行），
 *   首周目（`context.clears === 0` 且 `advanced.clears >= 1`）推 `realm_unlocked`，
 *   终帧 `exploring=false / reason='no_battle'`；
 * - 帧字段：`zone {code,name,realm}`、`clears`；无 `nodeCode/nodeName/idleUnlocked`。
 *
 * 边界纪律（AGENTS.local.md §4）：无角色、断线、切后台、NaN/0 极值、门槛为 0、
 * settle 失败、涨层后重读失败、realm 越界等一律有断言，不只测 happy path。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  OnlineExploreService,
  type OnlineCharacterState,
} from '../../../src/modules/logic/zone/internal/online-explore.service.js';
import { ZoneService } from '../../../src/modules/logic/zone/internal/zone.service.js';
import { ONLINE_TICK } from '../../../src/modules/logic/zone/internal/online-tick.config.js';
import type { ZoneOnlineFrame } from '../../../src/modules/logic/zone/internal/online.types.js';
import type { ZoneOnlineContext } from '../../../src/modules/logic/zone/internal/zone.types.js';
import { OnlineNotifyService } from '../../../src/modules/logic/zone/internal/online-notify.service.js';
import { OnlineSessionService } from '../../../src/modules/online/online-session.service.js';
import { FakeDatabase } from '../../helpers/fake-db.js';
import { stub, type Stub } from '../../helpers/stub.js';

function context(overrides: Partial<ZoneOnlineContext> = {}): ZoneOnlineContext {
  return {
    zoneId: 5,
    zoneCode: 'zone_houshan',
    zoneName: '后山历练峰',
    realm: 5,
    maxFloor: 3,
    floor: 1,
    bestFloor: 0,
    cleared: false,
    clears: 0,
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

/** 推送服务替身（缺省记录调用）。 */
interface NotifierStub {
  record: Stub;
  flush: Stub;
  forget: Stub;
}

function stubNotifier(): NotifierStub {
  return { record: stub(() => true), flush: stub(() => false), forget: stub(() => undefined) };
}

interface MakeOptions {
  /** characterId：默认 11；null = 该 userId 没有角色 */
  characterId?: number | null;
  context?: ZoneOnlineContext | null;
  sessions?: OnlineSessionService;
  now?: () => number;
  /** settleKills 的返回；缺省成功且给 3 灵韵 */
  settle?: unknown;
  /** 推送服务替身；缺省记录调用的 stub */
  notifier?: NotifierStub | OnlineNotifyService | null;
}

function makeService(options: MakeOptions = {}) {
  const {
    characterId = 11,
    context: ctx = context(),
    sessions = new OnlineSessionService(null, { heartbeatTtlMs: 60_000 }),
    now,
    settle = { ok: true, data: { lingyunGained: 3 } },
    notifier = stubNotifier(),
  } = options;
  const characterService = {
    findByUserId: stub(async (_userId: number) =>
      characterId === null ? null : { id: characterId, userId: _userId, realm: 5 },
    ),
  };
  const zoneService = {
    onlineContext: stub(async () => ctx),
    advanceFloor: stub(async () => ({ floor: 2, bestFloor: 1, cleared: false, clears: 0 })),
    leaveBattle: stub(async () => ({ left: false })),
  };
  const combatLogic = { settleKills: stub(async () => settle) };
  const service = new TestableOnlineExploreService(
    sessions,
    characterService as never,
    zoneService as never,
    combatLogic as never,
    notifier as never,
    now === undefined ? {} : { now },
  );
  return { service, sessions, characterService, zoneService, combatLogic, notifier };
}

// ===== §22：FakeDatabase 驱动的真实 ZoneService（SQL 可断言） =====

type Row = Record<string, unknown>;

interface ExploreWorld {
  zone: Row;
  /** `game_zone_state` 行；null = 不在任何秘境战斗 */
  state: Row | null;
  /** `game_zone_progress` 行（INSERT handler 会按真实 upsert 语义维护） */
  progress: Row;
}

/** 与 `zone_houshan` 种子同形：门槛 75/87/99，3 层，第 3 层 Boss。 */
function zoneRow(overrides: Row = {}): Row {
  return {
    id: 5,
    code: 'zone_houshan',
    name: '后山历练峰',
    order_index: 1,
    unit_code: 'u_r5_tongmo',
    boss_code: 'u_boss_yaowang',
    base_power: 75,
    power_step: 12,
    max_floor: 3,
    lingyun_bonus_per_floor: 10,
    boss_every_floors: 3,
    tier_bonus_every_floors: 0,
    drop_bonus_every_floors: 0,
    realm: 5,
    tier_kind: 'training',
    unlock_item_code: null,
    idle_allowed: true,
    chapter: null,
    min_realm: null,
    require_prev_best_floor: 0,
    ...overrides,
  };
}

interface DbServiceOptions {
  /** 角色战力（门槛 75/87/99 好读）；缺省 100 */
  playerPower?: number;
  /** 秘境 realm（帧 `zone.realm` 展示值；NULL / 越界 → 0 未知）；缺省 5 */
  realm?: number | null;
  maxFloor?: number;
  bossEvery?: number;
  /** 初始进度（可模拟半程 / 已突破再挑战） */
  floor?: number;
  bestFloor?: number;
  cleared?: boolean;
  clears?: number;
  settle?: unknown;
  sessions?: OnlineSessionService;
  notifier?: NotifierStub | OnlineNotifyService | null;
  now?: () => number;
}

function makeWorld(options: DbServiceOptions = {}): ExploreWorld {
  return {
    zone: zoneRow({
      max_floor: options.maxFloor ?? 3,
      boss_every_floors: options.bossEvery ?? 3,
      ...(options.realm === undefined ? {} : { realm: options.realm }),
    }),
    state: { character_id: 11, current_zone_id: 5 },
    progress: {
      id: 1,
      character_id: 11,
      zone_id: 5,
      floor: options.floor ?? 1,
      best_floor: options.bestFloor ?? 0,
      cleared: options.cleared ?? false,
      clears: options.clears ?? 0,
    },
  };
}

/**
 * 按真实 SQL 分发的假数据库：
 * - `game_zone_state` 行被 `leaveBattle` 的 DELETE 清除（在线战斗互斥复位）；
 * - `advanceFloor` 的 `INSERT ... RETURNING *` 维护进度并把 `clears` 喂回返回体
 *   （与真实 upsert 同口径：floor/best_floor/cleared 覆写、clears 只增）。
 */
function exploreDb(world: ExploreWorld): FakeDatabase {
  return new FakeDatabase()
    .on(/^SELECT \* FROM game_zone_state WHERE character_id = \$1$/, () => ({
      rows: world.state ? [world.state] : [],
    }))
    .on(/^DELETE FROM game_zone_state WHERE character_id = \$1$/, () => {
      world.state = null;
      return { rows: [] };
    })
    .on(/^SELECT \* FROM game_zones WHERE id = \$1$/, () => ({ rows: [world.zone] }))
    .on(/^SELECT \* FROM game_zone_progress WHERE character_id = \$1 AND zone_id = \$2$/, () => ({
      rows: [world.progress],
    }))
    .on(/^INSERT INTO game_zone_progress[\s\S]*RETURNING \*$/, (params) => {
      const [, , storedFloor, nextBest, clearedFlag, clearsDelta] = params as [
        number,
        number,
        number,
        number,
        unknown,
        unknown,
      ];
      world.progress.floor = Number(storedFloor);
      world.progress.best_floor = Math.max(Number(world.progress.best_floor), Number(nextBest));
      world.progress.cleared = Boolean(clearedFlag);
      world.progress.clears = Number(world.progress.clears) + (Number(clearsDelta) || 0);
      return { rows: [{ ...world.progress }] };
    });
}

/** 真实 `ZoneService`（在线上下文 / 涨层 / 离场全走 SQL）+ 受控战力桩。 */
function dbService(options: DbServiceOptions = {}) {
  const world = makeWorld(options);
  const db = exploreDb(world);
  const characterService = {
    findByUserId: stub(async (_userId: number) => ({ id: 11, userId: _userId, realm: 5 })),
  };
  // 战力精确控制（好读的门槛断言），不依赖装备 / 功法 SQL
  const power = { compute: stub(async () => options.playerPower ?? 100) };
  const zoneService = new ZoneService(
    db as never,
    characterService as never,
    { settleKills: stub(async () => null) } as never,
    power as never,
  );
  const combatLogic = {
    settleKills: stub(async () => options.settle ?? { ok: true, data: { lingyunGained: 3 } }),
  };
  const sessions = options.sessions ?? new OnlineSessionService(null, { heartbeatTtlMs: 60_000 });
  const notifier = options.notifier ?? stubNotifier();
  const service = new TestableOnlineExploreService(
    sessions,
    characterService as never,
    zoneService,
    combatLogic as never,
    notifier as never,
    options.now === undefined ? {} : { now: options.now },
  );
  return { service, sessions, db, zoneService, combatLogic, notifier, world };
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

  test('未进入任何秘境（onlineContext 为 null）→ 不建状态、不结算、不推送（§22 无地图白名单）', async () => {
    const { service, sessions, zoneService, combatLogic, notifier } = makeService({ context: null });
    sessions.touch(7, 0);
    const report = await service.runTick(1_000);
    assert.equal(report.processed, 1);
    assert.equal(service.stateOf(11), null);
    assert.equal(zoneService.onlineContext.callCount, 1);
    assert.equal(combatLogic.settleKills.callCount, 0);
    assert.equal((notifier as NotifierStub).record.callCount, 0);
  });

  test('tickCharacter：上下文为 null 直接返回 null（一拍什么都不做）', async () => {
    const { service, combatLogic } = makeService({ context: null });
    const frame = await service.runOne(7, 11, 5, 1_000);
    assert.equal(frame, null);
    assert.equal(service.stateOf(11), null);
    assert.equal(combatLogic.settleKills.callCount, 0);
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

describe('OnlineExploreService · 面板读帧 snapshot（T3/T5 · §22）', () => {
  test('会话判死 → reason=no_session、online=false，但仍带「上次打到哪」', async () => {
    const { service } = makeService();
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.online, false);
    assert.equal(frame.exploring, false);
    assert.equal(frame.reason, 'no_session');
    // 不是「第 0 层」：离线帧保留服务端内存里的最后进度
    assert.deepEqual(frame.zone, { code: 'zone_houshan', name: '后山历练峰', realm: 5 });
    assert.equal(frame.floor, 1);
    assert.equal(frame.floorRequirement, 75);
    assert.equal(frame.clears, 0);
  });

  test('会话活着但页面不可见 → reason=hidden、online=false，进度同样保留', async () => {
    const { service, sessions } = makeService();
    sessions.touch(7, 0);
    sessions.setVisible(7, false, 0);
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.online, false);
    assert.equal(frame.reason, 'hidden');
    assert.equal(frame.floor, 1);
    assert.equal(frame.zone?.realm, 5);
  });

  test('离线 + 未进任何秘境 → 空帧（zone=null、floor=0、clears=0）', async () => {
    const { service } = makeService({ context: null });
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.reason, 'no_session');
    assert.equal(frame.zone, null);
    assert.equal(frame.floor, 0);
    assert.equal(frame.bestFloor, 0);
    assert.equal(frame.clears, 0);
  });

  test('无角色 → 空帧，不查秘境上下文', async () => {
    const { service, zoneService } = makeService({ characterId: null });
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.reason, 'no_session');
    assert.equal(frame.zone, null);
    assert.equal(frame.floor, 0);
    assert.equal(zoneService.onlineContext.callCount, 0);
  });

  test('在线但未进入秘境 → reason=no_battle（§22 取代 no_realm）', async () => {
    const { service, sessions } = makeService({ context: null });
    sessions.touch(7, 0);
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.online, true);
    assert.equal(frame.exploring, false);
    assert.equal(frame.reason, 'no_battle');
    assert.equal(frame.zone, null);
    assert.equal(frame.kills, 0);
    assert.deepEqual(frame.events, []);
  });

  test('在线战斗中：exploring=true，帧只有 {code,name,realm}，无任何地图节点残留字段', async () => {
    const { service, sessions } = makeService({
      context: context({ playerPower: 80, floorRequirement: 87, floor: 2, bestFloor: 1 }),
    });
    sessions.touch(7, 0);
    const frame = await service.snapshot(7, 1_000);
    assert.equal(frame.exploring, true);
    assert.equal(frame.reason, 'ok');
    assert.deepEqual(frame.zone, { code: 'zone_houshan', name: '后山历练峰', realm: 5 });
    assert.equal(frame.floor, 2);
    assert.equal(frame.maxFloor, 3);
    assert.equal(frame.floorRequirement, 87);
    assert.equal(frame.playerPower, 80);
    assert.equal(frame.stuck, true);
    assert.equal(frame.shortfall, 7);
    assert.equal(frame.killsPerFloor, ONLINE_TICK.killsPerFloor);
    assert.equal(frame.cleared, false);
    assert.equal(frame.clears, 0);
    assert.equal(frame.floorKills, 0);
    assert.deepEqual(frame.events, []);
    assert.equal(frame.kills, 0);
    // §22：掉字段死语义不得复活
    assert.ok(!('nodeCode' in frame), '帧不是地图节点视图');
    assert.ok(!('nodeName' in frame));
    assert.ok(!('idleUnlocked' in frame));
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

  test('在线快照带上内存里的本层击杀（floorKills 照实给，读帧不消费产出）', async () => {
    const { service, sessions } = makeService({
      context: context({ playerPower: 75, floorRequirement: 75 }),
    });
    sessions.touch(7, 0);
    for (let i = 0; i < 3; i++) await service.runTick(i * 1_000);
    const frame = await service.snapshot(7, 3_000);
    assert.equal(frame.floorKills, 3);
    assert.equal(frame.kills, 0, '面板读帧不消费产出摘要');
    assert.equal(frame.lingyunGained, 0);
  });

  test('zone.realm 为 NULL / 越界 → 帧 realm=0（未知绝不静默参与展示）', async () => {
    for (const realm of [null, 0, 15, 99]) {
      const { service } = dbService({ realm, playerPower: 100 });
      const frame = await service.runOne(7, 11, 5, 1_000);
      assert.equal(frame?.zone?.realm, 0, `realm=${String(realm)}`);
    }
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

  test('Boss 层用 bossCode 结算（遭遇单位由 onlineContext 既有口径给出）', async () => {
    const { service, combatLogic } = makeService({
      context: context({
        floor: 3,
        isBossFloor: true,
        playerPower: 100,
        floorRequirement: 99,
        unitCode: 'u_boss_yaowang',
      }),
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

  test('settleKills 失败（单位不存在 / 不可击杀）→ 本拍返回 null，不涨层、不退出、不抛', async () => {
    const { service, zoneService } = makeService({
      settle: { ok: false, result: { success: false, message: '单位不存在', data: { code: 'UNIT_NOT_FOUND' } } },
    });
    const frame = await service.runOne(7, 11, 5, 1_000);
    assert.equal(frame, null);
    assert.equal(zoneService.advanceFloor.callCount, 0);
    assert.equal(zoneService.leaveBattle.callCount, 0);
  });

  test('offline 无会话 → runTick 不结算（离线不推进、也不产出）', async () => {
    const { service, combatLogic } = makeService();
    await service.runTick(1_000);
    assert.equal(combatLogic.settleKills.callCount, 0);
  });
});

describe('OnlineExploreService · 步 3/4：涨层 / Boss 层 / 踏满即退出（T4 · §22）', () => {
  test('恰好在第 30 只击杀时涨层：落库一次、事件 floor_up（普通层不发 boss_floor）、本层击杀清零', async () => {
    // playerPower=75 → r=1 → 一拍恰好 1 只，30 拍 = 30 只（边界好读）
    const { service, db, world } = dbService({ playerPower: 75 });
    let last: ZoneOnlineFrame | null = null;
    for (let i = 0; i < 30; i++) last = await service.runOne(7, 11, 5, i * 1_000);
    assert.equal(world.progress.floor, 2);
    assert.equal(last?.floor, 2);
    assert.equal(last?.floorKills, 0);
    assert.equal(last?.clears, 0);
    assert.deepEqual(last?.events, ['floor_up']);
    const insert = db.lastCall(/^INSERT INTO game_zone_progress/);
    assert.deepEqual(insert?.params, [11, 5, 2, 1, false, 0]);
    assert.equal(db.callsMatching(/^DELETE FROM game_zone_state/).length, 0, '未踏满一轮不退出');
  });

  test('第 29 只时不涨层（边界：差 1 只）', async () => {
    const { service, db, world } = dbService({ playerPower: 75 });
    for (let i = 0; i < 29; i++) await service.runOne(7, 11, 5, i * 1_000);
    assert.equal(db.callsMatching(/^INSERT INTO game_zone_progress/).length, 0);
    assert.equal(world.progress.floor, 1);
  });

  test('进入 Boss 层（第 3 层）才发 boss_floor；70 拍打不满 Boss 层', async () => {
    const { service, db, world } = dbService({ playerPower: 100 });
    const events: string[] = [];
    let last: ZoneOnlineFrame | null = null;
    for (let i = 0; i < 70; i++) {
      last = await service.runOne(7, 11, 5, i * 1_000);
      if (last) events.push(...last.events);
    }
    assert.ok(events.includes('floor_up'), '第 1 层 → 第 2 层');
    assert.ok(events.includes('boss_floor'), '第 2 层 → 第 3 层（Boss 层）');
    assert.equal(world.progress.floor, 3);
    assert.equal(last?.isBossFloor, true);
    assert.ok(!events.includes('boss_defeated'), '70 拍内 Boss 层还没打满 30 只');
    assert.equal(db.callsMatching(/^DELETE FROM game_zone_state/).length, 0);
  });

  test('Boss 未击败前停在 Boss 层（打不赢 → 原地刷、不涨层，卡层有产出）', async () => {
    const built = dbService({ playerPower: 90 });
    // 先把层推进到 3（模拟前面已打过）
    await built.zoneService.advanceFloor(11, 5, { floor: 1, bestFloor: 0, maxFloor: 3 });
    await built.zoneService.advanceFloor(11, 5, { floor: 2, bestFloor: 1, maxFloor: 3 });
    assert.equal(built.world.progress.floor, 3);
    for (let i = 0; i < 40; i++) await built.service.runOne(7, 11, 5, i * 1_000);
    assert.equal(
      built.db.callsMatching(/^INSERT INTO game_zone_progress/).length,
      2,
      '卡层不涨层（只剩预置的两笔）',
    );
    assert.ok(
      built.combatLogic.settleKills.callCount >= 30 && built.combatLogic.settleKills.callCount <= 40,
      '卡层仍有产出（r<1 时部分拍只累计小数，不结算）',
    );
    assert.equal(built.service.stateOf(11)?.stuck, true);
  });

  test('踏满一轮（首周目·真实流）：末层再涨一次 → 自动退出 + boss_defeated + realm_unlocked + 终帧 no_battle', async () => {
    // 真实 ZoneService + FakeDatabase 走完 3 层：第 80 拍前后从末层（floor === maxFloor）
    // 再涨一次 → advanceFloor 判通关（RETURNING 喂 clears 0→1）→ leaveBattle 落 DELETE
    const built = dbService({ playerPower: 100 });
    const events: string[] = [];
    let last: ZoneOnlineFrame | null = null;
    for (let i = 0; i < 100; i++) {
      const frame = await built.service.runOne(7, 11, 5, i * 1_000);
      if (frame) {
        last = frame;
        events.push(...frame.events);
      }
    }
    // 事件全景：两层普通涨层（floor_up ×2）→ 进 Boss 层 → 击败 Boss → 首周目解锁（各恰好一次）
    assert.equal(events.filter((e) => e === 'floor_up').length, 2);
    assert.equal(events.filter((e) => e === 'boss_floor').length, 1);
    assert.equal(events.filter((e) => e === 'boss_defeated').length, 1);
    assert.equal(events.filter((e) => e === 'realm_unlocked').length, 1);
    // 落库：两笔普通 INSERT + 一笔通关 INSERT（clears 0→1），floor 停 maxFloor 不写 4
    const inserts = built.db.callsMatching(/^INSERT INTO game_zone_progress/);
    assert.equal(inserts.length, 3);
    assert.deepEqual(built.db.lastCall(/^INSERT INTO game_zone_progress/)?.params, [11, 5, 3, 3, true, 1]);
    assert.equal(built.world.progress.floor, 3);
    assert.equal(built.world.progress.clears, 1);
    assert.equal(built.world.progress.best_floor, 3);
    // §22 Q3：自动退出（清 game_zone_state ⇒ 离线挂机互斥复位）
    const deletes = built.db.callsMatching(/^DELETE FROM game_zone_state/);
    assert.equal(deletes.length, 1);
    assert.deepEqual(deletes[0]?.params, [11]);
    assert.equal(built.world.state, null, '战斗行已清');
    // 终帧：打满一轮的事实全部在场
    assert.ok(last !== null);
    assert.deepEqual(last.events, ['boss_defeated', 'realm_unlocked']);
    assert.equal(last.exploring, false);
    assert.equal(last.reason, 'no_battle');
    assert.equal(last.online, true);
    assert.equal(last.cleared, true);
    assert.equal(last.clears, 1);
    assert.equal(last.floor, 3);
    assert.equal(last.bestFloor, 3);
    assert.equal(last.isBossFloor, false);
    assert.ok(last.floorKills <= ONLINE_TICK.killsPerFloor);
    assert.deepEqual(last.zone, { code: 'zone_houshan', name: '后山历练峰', realm: 5 });
    // 退出后的下一拍：不再结算
    const settleAt = built.combatLogic.settleKills.callCount;
    assert.equal(await built.service.runOne(7, 11, 5, 101_000), null);
    assert.equal(built.combatLogic.settleKills.callCount, settleAt);
  });

  test('打满一轮的落库协作（SQL 口径）：advanceFloor 通关走 INSERT ... RETURNING 喂 clears、leaveBattle 落 DELETE', async () => {
    const built = dbService({ playerPower: 100 });
    // 通关这一环的 SQL 口径：advanceFloor(floor=末层) → cleared，RETURNING 把 clears 喂回
    const advanced = await built.zoneService.advanceFloor(11, 5, { floor: 3, bestFloor: 2, maxFloor: 3 });
    assert.deepEqual(advanced, { floor: 3, bestFloor: 3, cleared: true, clears: 1 });
    const insert = built.db.lastCall(/^INSERT INTO game_zone_progress/);
    assert.deepEqual(insert?.params, [11, 5, 3, 3, true, 1]);
    assert.match(String(insert?.sql), /RETURNING \*$/);
    // FakeDatabase 世界里 RETURNING 行的 clears 已从 0 累加到 1（首周目）
    assert.equal(built.world.progress.clears, 1);
    assert.equal(built.world.progress.floor, 3, '通关时 floor 停 maxFloor 不写 4');
    // §22 Q3：离场清 game_zone_state 行（自动退出的落点）
    const { left } = await built.zoneService.leaveBattle(11);
    assert.equal(left, true);
    const deletes = built.db.callsMatching(/^DELETE FROM game_zone_state/);
    assert.equal(deletes.length, 1);
    assert.deepEqual(deletes[0]?.params, [11]);
    assert.equal(built.world.state, null, '战斗行已清');
    // 已清行 → onlineContext 为 null → tick 一拍什么都不做（自动退出后的世界）
    const settleAt = built.combatLogic.settleKills.callCount;
    assert.equal(await built.service.runOne(7, 11, 5, 1_000), null);
    assert.equal(built.combatLogic.settleKills.callCount, settleAt);
  });

  test('再打一轮（clears≥1 已突破·真实流）：能再次打满、clears→2、不推 realm_unlocked、照样自动退出', async () => {
    // startRun 已把 floor 重置回 1：progress { floor:1, best_floor:3, cleared:true, clears:1 }，
    // cleared 列恒 true 是解锁证据 —— onlineContext 用「∧ floor ≥ maxFloor」算出本轮 cleared=false
    const built = dbService({ playerPower: 100, floor: 1, bestFloor: 3, cleared: true, clears: 1 });
    const events: string[] = [];
    let last: ZoneOnlineFrame | null = null;
    for (let i = 0; i < 120; i++) {
      const frame = await built.service.runOne(7, 11, 5, i * 1_000);
      if (frame) {
        last = frame;
        events.push(...frame.events);
      }
    }
    assert.equal(events.filter((e) => e === 'boss_defeated').length, 1);
    assert.ok(events.includes('floor_up'), '第二轮照样从第 1 层一路涨层');
    assert.ok(!events.includes('realm_unlocked'), '只有首周目（clears 0→1）才推解锁');
    assert.equal(built.db.callsMatching(/^INSERT INTO game_zone_progress/).length, 3, '新一轮三笔涨层落库');
    assert.equal(built.world.progress.clears, 2, 'clears 只增不减：1 → 2');
    assert.equal(built.db.callsMatching(/^DELETE FROM game_zone_state/).length, 1, '重复挑战打满也自动退出');
    assert.ok(last !== null);
    assert.equal(last.clears, 2, '终帧 clears 取 advanced.clears');
    assert.equal(last.exploring, false);
    assert.equal(last.reason, 'no_battle');
  });

  test('maxFloor=1（真实流）：首层即末层 → 打满即退出，只有 floor_up + realm_unlocked（无 Boss 事件）', async () => {
    const built = dbService({ playerPower: 100, maxFloor: 1 });
    const events: string[] = [];
    let last: ZoneOnlineFrame | null = null;
    for (let i = 0; i < 40; i++) {
      const frame = await built.service.runOne(7, 11, 5, i * 1_000);
      if (frame) {
        last = frame;
        events.push(...frame.events);
      }
    }
    assert.deepEqual(events, ['floor_up', 'realm_unlocked']);
    assert.ok(!events.includes('boss_floor'));
    assert.ok(!events.includes('boss_defeated'));
    assert.equal(built.db.callsMatching(/^INSERT INTO game_zone_progress/).length, 1, '只通关一次');
    assert.deepEqual(built.db.lastCall(/^INSERT INTO game_zone_progress/)?.params, [11, 5, 1, 1, true, 1]);
    assert.equal(built.db.callsMatching(/^DELETE FROM game_zone_state/).length, 1);
    assert.equal(last?.floor, 1, 'maxFloor=1：floor 保持 1');
    assert.equal(last?.cleared, true);
    assert.ok((last?.floorKills ?? 0) <= ONLINE_TICK.killsPerFloor);
    // 自动退出后：tick 读到 state 已清，结算不再发生
    const settleAt = built.combatLogic.settleKills.callCount;
    await built.service.runOne(7, 11, 5, 41_000);
    assert.equal(built.combatLogic.settleKills.callCount, settleAt);
  });

  test('非 Boss 层踏满（末层不是 Boss）：通关事件 = floor_up + realm_unlocked，不出现 boss_floor/boss_defeated', async () => {
    const built = makeService({
      context: context({ floor: 1, maxFloor: 2, isBossFloor: false, playerPower: 100, floorRequirement: 75 }),
    });
    built.zoneService.advanceFloor = stub(async () => ({ floor: 2, bestFloor: 1, cleared: true, clears: 1 })) as never;
    built.zoneService.leaveBattle = stub(async () => ({ left: true })) as never;
    const events: string[] = [];
    let last: ZoneOnlineFrame | null = null;
    for (let i = 0; i < 40 && built.zoneService.advanceFloor.callCount === 0; i++) {
      last = await built.service.runOne(7, 11, 5, i * 1_000);
      if (last) events.push(...last.events);
    }
    assert.deepEqual(events, ['floor_up', 'realm_unlocked'], '非 Boss 层通关：涨层事件 + 首周目解锁');
    assert.ok(!events.includes('boss_floor'));
    assert.ok(!events.includes('boss_defeated'));
    assert.equal(last?.cleared, true);
    assert.equal(last?.floor, 2);
    assert.equal(last?.reason, 'no_battle');
  });

  test('闸门防重复结算：本轮已打满（context.cleared=true）的战斗行残存 → 不再涨层、clears 不复算', async () => {
    // 场景：leaveBattle 失败 / 战斗行残存时，progress 已是 { floor:3, cleared:true }
    const built = makeService({
      context: context({ floor: 3, maxFloor: 3, cleared: true, clears: 1, playerPower: 100, floorRequirement: 99 }),
    });
    for (let i = 0; i < 40; i++) await built.service.runOne(7, 11, 5, i * 1_000);
    assert.equal(built.zoneService.advanceFloor.callCount, 0, '已打满：闸门挡住，不再调用 advanceFloor');
    assert.equal(built.zoneService.leaveBattle.callCount, 0);
    assert.equal(built.service.stateOf(11)?.floorKills, 40, '原地累计击杀照常展示');
  });

  test('闸门允许末层推进：floor === maxFloor 且 !cleared → 仍调用 advanceFloor（通关入口回归）', async () => {
    const built = makeService({
      context: context({ floor: 3, maxFloor: 3, cleared: false, isBossFloor: true, playerPower: 100, floorRequirement: 99 }),
    });
    built.zoneService.advanceFloor = stub(async () => ({ floor: 3, bestFloor: 3, cleared: true, clears: 1 })) as never;
    built.zoneService.leaveBattle = stub(async () => ({ left: true })) as never;
    let frame: ZoneOnlineFrame | null = null;
    for (let i = 0; i < 40 && built.zoneService.advanceFloor.callCount === 0; i++) {
      frame = await built.service.runOne(7, 11, 5, i * 1_000);
    }
    assert.equal(built.zoneService.advanceFloor.callCount, 1, '末层（floor===maxFloor）也必须能涨这最后一下');
    assert.equal(built.zoneService.leaveBattle.callCount, 1);
    assert.deepEqual(frame?.events, ['boss_defeated', 'realm_unlocked']);
    assert.equal(frame?.reason, 'no_battle');
  });

  test('普通涨层后重读上下文失败（null）→ 帧退化为涨层前一层（防御，不产生 NaN）', async () => {
    const built = makeService({ context: context({ playerPower: 75, floorRequirement: 75 }) });
    let reads = 0;
    built.zoneService.onlineContext = stub(async () => {
      reads++;
      // 第 31 次（涨层后的那次重读）战斗上下文消失：模拟战斗中并发退出
      return reads <= 30 ? context({ playerPower: 75, floorRequirement: 75 }) : null;
    }) as never;
    let last: ZoneOnlineFrame | null = null;
    for (let i = 0; i < 30; i++) last = await built.service.runOne(7, 11, 5, i * 1_000);
    assert.equal(built.zoneService.advanceFloor.callCount, 1);
    assert.deepEqual(last?.events, ['floor_up']);
    assert.equal(last?.floor, 1, '重读失败：帧保持涨层前一层');
    assert.equal(last?.floorKills, 0);
  });

  test('涨层返回 cleared（打满一轮）→ 自动调用 leaveBattle 并返回 no_battle 终帧', async () => {
    const built = makeService({
      context: context({ floor: 2, maxFloor: 3, isBossFloor: true, playerPower: 100, floorRequirement: 87 }),
    });
    built.zoneService.advanceFloor = stub(async () => ({ floor: 3, bestFloor: 3, cleared: true, clears: 1 })) as never;
    built.zoneService.leaveBattle = stub(async () => ({ left: true })) as never;
    let frame: ZoneOnlineFrame | null = null;
    for (let i = 0; i < 40 && built.zoneService.advanceFloor.callCount === 0; i++) {
      frame = await built.service.runOne(7, 11, 5, i * 1_000);
    }
    assert.equal(built.zoneService.advanceFloor.callCount, 1, '恰好打满一轮');
    assert.equal(built.zoneService.leaveBattle.callCount, 1);
    assert.deepEqual(built.zoneService.leaveBattle.last, [11], 'leaveBattle 只带 characterId');
    assert.equal(frame?.reason, 'no_battle');
    assert.equal(frame?.exploring, false);
    assert.equal(frame?.online, true);
    assert.deepEqual(frame?.events, ['boss_defeated', 'realm_unlocked']);
    assert.equal(frame?.floor, 3, '终帧 floor 取 advanced.floor（maxFloor）');
    assert.equal(frame?.bestFloor, 3);
    assert.equal(frame?.cleared, true);
    assert.equal(frame?.clears, 1);
    assert.equal(frame?.isBossFloor, false);
    assert.ok((frame?.floorKills ?? 0) <= ONLINE_TICK.killsPerFloor, '地板击杀被夹到门槛以内');
    assert.deepEqual(frame?.zone, { code: 'zone_houshan', name: '后山历练峰', realm: 5 });
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
    const record = (notifier as NotifierStub).record;
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
    assert.equal((notifier as NotifierStub).record.callCount, 0);
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

// ===== T7：断线中途 / 解锁只推一次 / 会话断开不补算 =====

describe('OnlineExploreService · 会话断开中途（T7 离线不推进）', () => {
  test('在线 5 拍后断开：再跑 20 拍 floorKills 与 advanceFloor 都一动不动', async () => {
    const { service, sessions, zoneService, combatLogic } = makeService({
      context: context({ playerPower: 75, floorRequirement: 75 }),
    });
    sessions.touch(7, 0);
    for (let i = 0; i < 5; i++) await service.runTick(i * 1_000);
    assert.equal(service.stateOf(11)?.floorKills, 5);
    const settleCalls = combatLogic.settleKills.callCount;

    // 会话断开（判死 / 主动登出 / 页面隐藏都会走到这里）
    sessions.forget(7);
    for (let i = 5; i < 25; i++) await service.runTick(i * 1_000);

    assert.equal(service.stateOf(11)?.floorKills, 5, '离线期间击杀累计一动不动');
    assert.equal(combatLogic.settleKills.callCount, settleCalls, '离线不产出');
    assert.equal(zoneService.advanceFloor.callCount, 0, '离线不涨层');
  });

  test('短暂断线后重新上线：从上次的会话进度继续（不补算离线时长）', async () => {
    const { service, sessions } = makeService({ context: context({ playerPower: 75, floorRequirement: 75 }) });
    sessions.touch(7, 0);
    for (let i = 0; i < 5; i++) await service.runTick(i * 1_000);
    sessions.forget(7);
    // 断线 10 分钟：一拍都没推进（仍在 30 分钟内存治理窗口内）
    await service.runTick(600_000);
    assert.equal(service.stateOf(11)?.floorKills, 5);
    // 重新上线，只从第 6 只继续 —— 离线的那 10 分钟不补算
    sessions.touch(7, 601_000);
    await service.runTick(601_000);
    assert.equal(service.stateOf(11)?.floorKills, 6);
  });
});

describe('OnlineExploreService · 解锁推送只发生一次（T7 幂等 · §22 realm_unlocked）', () => {
  test('首周目打满（真实流）：所有推送帧里 realm_unlocked 只出现一次，打满后帧完全停止', async () => {
    const port = {
      sent: [] as Array<{ cmd: number; subCmd: number; data: unknown }>,
      broadcast: () => undefined,
      sendTo: (_userId: number, message: { cmd: number; subCmd: number; data: unknown }) => {
        port.sent.push(message);
        return true;
      },
    };
    const notifier = new OnlineNotifyService(port as never);
    const built = dbService({
      playerPower: 100,
      notifier,
      // 心跳 TTL 拉长：120 拍全程在线（只关心解锁幂等，不关心判死）
      sessions: new OnlineSessionService(null, { heartbeatTtlMs: 1_000_000 }),
    });
    built.sessions.touch(7, 0);
    for (let i = 0; i < 120; i++) await built.service.runTick(i * 1_000);
    // 踏满终帧可能恰好处在节流窗口末段而停在积压里 → flush 代表既有收尾口径
    notifier.flush(11, 120_000);

    const unlockedFrames = port.sent.filter((message) =>
      ((message.data as { events?: string[] }).events ?? []).includes('realm_unlocked'),
    );
    assert.equal(unlockedFrames.length, 1, '解锁只推一次（打满后 tick 不再产出帧）');
    assert.equal(built.db.callsMatching(/^DELETE FROM game_zone_state/).length, 1, '打满后自动退出');
    assert.ok(port.sent.length >= 2, '涨层 / Boss 层 / 打满各自有帧');
    const final = port.sent[port.sent.length - 1]?.data as ZoneOnlineFrame;
    assert.equal(final.exploring, false);
    assert.equal(final.reason, 'no_battle');
    assert.equal(final.cleared, true);
    assert.equal(final.clears, 1);
  });
});