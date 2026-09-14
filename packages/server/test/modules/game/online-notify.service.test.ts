/**
 * OnlineNotifyService 边界测试（P3.0 T5；任务书 §4；§22 重做帧字段后口径不变）。
 *
 * 重点：**节流**（10 秒内 ≤ ceil(10000/pushEveryMs) 次）、合并（击杀/灵韵求和、事件并集）、
 * 「没内容不发」、路由正确（`cmd=100, subCmd=5`）、端口未命中也不抛。
 *
 * §22 变更：帧工厂按新契约构造 —— `zone` 带 `realm`、去 `nodeCode/nodeName/idleUnlocked`、
 * 加 `clears`；合并语义本身没变（快照取最新 / 产出求和 / 事件并集保序去重）。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { OnlineNotifyService } from '../../../src/modules/logic/zone/internal/online-notify.service.js';
import { ONLINE_TICK } from '../../../src/modules/logic/zone/internal/online-tick.config.js';
import type { ZoneOnlineFrame } from '../../../src/modules/logic/zone/internal/online.types.js';
import { ZONE_CMD } from '../../../src/ionet/cmd.js';
import type { NotificationMessage, NotificationPort } from '../../../src/common/ports/notification.port.js';

function frame(overrides: Partial<ZoneOnlineFrame> = {}): ZoneOnlineFrame {
  return {
    online: true,
    exploring: true,
    reason: 'ok',
    zone: { code: 'zone_houshan', name: '后山历练峰', realm: 5 },
    floor: 1,
    maxFloor: 3,
    bestFloor: 0,
    cleared: false,
    clears: 0,
    isBossFloor: false,
    playerPower: 100,
    floorRequirement: 75,
    floorKills: 1,
    killsPerFloor: ONLINE_TICK.killsPerFloor,
    stuck: false,
    shortfall: 0,
    kills: 1,
    lingyunGained: 3,
    events: [],
    tickMs: ONLINE_TICK.tickMs,
    pushEveryMs: ONLINE_TICK.pushEveryMs,
    ...overrides,
  };
}

function fakePort(hit = true): NotificationPort & { sent: NotificationMessage[] } {
  const sent: NotificationMessage[] = [];
  return {
    sent,
    broadcast: () => undefined,
    sendTo: (_userId: number, message: NotificationMessage) => {
      sent.push(message);
      return hit;
    },
  };
}

describe('OnlineNotifyService · 路由与内容门槛', () => {
  test('推送路由是 (100,5)，信封由框架补 kind（业务只给 cmd/subCmd/data）', () => {
    const port = fakePort();
    const notify = new OnlineNotifyService(port);
    notify.record(7, 11, frame(), 0);
    assert.equal(port.sent.length, 1);
    assert.equal(port.sent[0]?.cmd, ZONE_CMD.cmd);
    assert.equal(port.sent[0]?.subCmd, ZONE_CMD.online);
    assert.equal((port.sent[0]?.data as ZoneOnlineFrame).floor, 1);
    assert.ok(!('kind' in (port.sent[0] as object)), 'kind 由框架 createNotificationMessage 补，业务不得自造');
  });

  test('没内容不发：kills=0 且无事件 → 静默（站着不动不该每 3 秒一条空帧）', () => {
    const port = fakePort();
    const notify = new OnlineNotifyService(port);
    assert.equal(notify.record(7, 11, frame({ kills: 0, lingyunGained: 0 }), 0), false);
    assert.equal(notify.sentCount, 0);
    assert.equal(notify.pendingCount, 0);
  });

  test('只有事件、没有击杀也会发（如卡层提示 / 解锁）', () => {
    const port = fakePort();
    const notify = new OnlineNotifyService(port);
    assert.equal(notify.record(7, 11, frame({ kills: 0, lingyunGained: 0, events: ['stuck'] }), 0), true);
    assert.equal(notify.sentCount, 1);
  });

  test('未命中在线连接（端口返回 false）仍算一次尝试，delivered 不加', () => {
    const notify = new OnlineNotifyService(fakePort(false));
    notify.record(7, 11, frame(), 0);
    assert.equal(notify.sentCount, 1);
    assert.equal(notify.deliveredCount, 0);
  });

  test('端口缺失（@Optional，未挂对外服）→ 不抛，尝试仍计数', () => {
    const notify = new OnlineNotifyService(null);
    assert.doesNotThrow(() => notify.record(7, 11, frame(), 0));
    assert.equal(notify.sentCount, 1);
    assert.equal(notify.pendingCount, 0);
  });
});

describe('OnlineNotifyService · 节流（pushEveryMs）', () => {
  test('首帧立即发，之后 pushEveryMs 内合并', () => {
    const port = fakePort();
    const notify = new OnlineNotifyService(port);
    assert.equal(notify.record(7, 11, frame({ kills: 1 }), 0), true, '首帧立即发');
    assert.equal(notify.record(7, 11, frame({ kills: 1 }), 1_000), false, '1s 内合并');
    assert.equal(notify.record(7, 11, frame({ kills: 1 }), 2_000), false, '2s 内合并');
    assert.equal(notify.sentCount, 1);
    assert.equal(notify.pendingCount, 1);
    assert.equal(notify.record(7, 11, frame({ kills: 1 }), 3_000), true, '到 3s 才发');
    assert.equal(notify.sentCount, 2);
    assert.equal(notify.pendingCount, 0);
  });

  test('1 秒 tick 下连续 10 秒：推送次数 ≤ ceil(10000/3000) = 4', () => {
    const port = fakePort();
    const notify = new OnlineNotifyService(port);
    let sends = 0;
    for (let t = 0; t < 10_000; t += ONLINE_TICK.tickMs) {
      if (notify.record(7, 11, frame({ kills: 1 }), t)) sends++;
    }
    assert.ok(sends <= Math.ceil(10_000 / ONLINE_TICK.pushEveryMs), `实际 ${sends} 次`);
    assert.equal(sends, 4);
    assert.equal(notify.sentCount, 4);
    assert.equal(port.sent.length, 4);
  });

  test('恰好等于 pushEveryMs 就发（边界：>= 而不是 >）', () => {
    const notify = new OnlineNotifyService(fakePort());
    notify.record(7, 11, frame(), 0);
    assert.equal(notify.record(7, 11, frame(), ONLINE_TICK.pushEveryMs), true);
  });

  test('多角色各自节流，互不影响', () => {
    const notify = new OnlineNotifyService(fakePort());
    assert.equal(notify.record(7, 11, frame(), 0), true);
    assert.equal(notify.record(8, 22, frame(), 0), true);
    assert.equal(notify.record(7, 11, frame(), 1_000), false);
    assert.equal(notify.record(8, 22, frame(), 1_000), false);
    assert.equal(notify.sentCount, 2);
    assert.equal(notify.pendingCount, 2);
  });
});

describe('OnlineNotifyService · 合并语义', () => {
  test('击杀 / 灵韵求和，事件保序去重并集', () => {
    const port = fakePort();
    const notify = new OnlineNotifyService(port);
    notify.record(7, 11, frame({ kills: 1, lingyunGained: 3, events: ['stuck'] }), 0);
    notify.record(7, 11, frame({ kills: 2, lingyunGained: 6, events: ['floor_up'] }), 1_000);
    notify.record(7, 11, frame({ kills: 1, lingyunGained: 3, events: ['stuck', 'floor_up'] }), 2_000);
    notify.record(7, 11, frame({ kills: 1, lingyunGained: 3 }), 3_000);
    const merged = port.sent[1]?.data as ZoneOnlineFrame;
    assert.equal(merged.kills, 4, '第二次推送：3 个待发帧的击杀求和');
    assert.equal(merged.lingyunGained, 12);
    assert.deepEqual(merged.events, ['floor_up', 'stuck'], '保序去重：先是新出现的 floor_up，stuck 已在');
  });

  test('快照字段取最新（层数 / 进度 / 卡层提示以最后一拍为准）', () => {
    const port = fakePort();
    const notify = new OnlineNotifyService(port);
    notify.record(7, 11, frame({ floor: 1, clears: 0, cleared: false }), 0);
    notify.record(7, 11, frame({ floor: 2, stuck: true, shortfall: 7 }), 1_000);
    notify.record(
      7,
      11,
      frame({
        floor: 2,
        floorKills: 3,
        stuck: true,
        shortfall: 7,
        cleared: true,
        clears: 1,
        exploring: false,
        reason: 'no_battle',
      }),
      3_000,
    );
    const merged = port.sent[1]?.data as ZoneOnlineFrame;
    assert.equal(merged.floor, 2);
    assert.equal(merged.floorKills, 3);
    assert.equal(merged.stuck, true);
    assert.equal(merged.shortfall, 7);
    // §22：踏满一轮的终帧作为最新快照覆盖合并结果（不守住旧的状态位）
    assert.equal(merged.cleared, true);
    assert.equal(merged.clears, 1);
    assert.equal(merged.exploring, false);
    assert.equal(merged.reason, 'no_battle');
  });

  test('合并只影响待发帧，不修改传入的帧对象', () => {
    const notify = new OnlineNotifyService(fakePort());
    const first = frame({ kills: 1 });
    notify.record(7, 11, first, 0);
    notify.record(7, 11, frame({ kills: 5 }), 1_000);
    assert.equal(first.kills, 1);
  });
});

describe('OnlineNotifyService · flush / forget', () => {
  test('flush：把积压发出去；无积压返回 false', () => {
    const port = fakePort();
    const notify = new OnlineNotifyService(port);
    notify.record(7, 11, frame(), 0);
    notify.record(7, 11, frame({ kills: 2 }), 1_000);
    assert.equal(notify.flush(11, 1_500), true);
    assert.equal(notify.sentCount, 2);
    assert.equal(notify.flush(11, 1_500), false);
  });

  test('forget：清掉积压与节流时刻（角色离线后立刻重连不被旧节流卡住）', () => {
    const notify = new OnlineNotifyService(fakePort());
    notify.record(7, 11, frame(), 0);
    notify.record(7, 11, frame({ kills: 2 }), 1_000);
    assert.equal(notify.pendingCount, 1);
    notify.forget(11);
    assert.equal(notify.pendingCount, 0);
    assert.equal(notify.record(7, 11, frame(), 1_100), true, 'forget 后立即发');
  });

  test('forget 未知角色是幂等空操作', () => {
    const notify = new OnlineNotifyService(fakePort());
    assert.doesNotThrow(() => notify.forget(999));
    assert.equal(notify.pendingCount, 0);
  });

  test('节流窗口：跨窗口后仍按 pushEveryMs 计（不是「每角色只发一次」）', () => {
    const notify = new OnlineNotifyService(fakePort());
    assert.equal(notify.record(7, 11, frame(), 0), true);
    assert.equal(notify.record(7, 11, frame(), 3_000), true);
    assert.equal(notify.record(7, 11, frame(), 6_000), true);
    assert.equal(notify.sentCount, 3);
  });
});