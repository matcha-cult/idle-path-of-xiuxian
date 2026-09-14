/**
 * `ZoneStore` 在线历练口径（P3.0 T6）。
 *
 * 三条必须钉死的口径：
 * 1. **帧只存不算**：`handleNotification` / `loadOnline` 只覆盖 `online`，客户端不本地推进；
 * 2. **可见性上报只报 boolean**：`reportVisibility` 发出的体里**没有**任何时长字段；
 * 3. **失败静默**：实况读取与可见性上报都不是业务动作，失败不写 `error`、不弹错。
 */
import { describe, expect, it } from 'vitest';
import { ZONE_CMD, type ZoneOnlineData } from '@idle-path/ionet-transport';
import type { MockHandler, MockRequest } from '@idle-path/ionet-transport/testing';
import { createPanelHarness } from '../helpers/panel-harness.js';

type Req = MockRequest;
const ok = (data: unknown): { data: unknown } => ({ data: { success: true, message: 'ok', data } });
const fail = (code: string): { data: unknown } => ({ data: { success: false, message: code, data: { code } } });

function frame(overrides: Partial<ZoneOnlineData> = {}): ZoneOnlineData {
  return {
    online: true,
    exploring: true,
    reason: 'ok',
    zone: { code: 'zone_r4', name: '后山兽潮', realm: 4 },
    floor: 1,
    maxFloor: 3,
    bestFloor: 0,
    cleared: false,
    clears: 0,
    isBossFloor: false,
    playerPower: 100,
    floorRequirement: 75,
    floorKills: 12,
    killsPerFloor: 30,
    stuck: false,
    shortfall: 0,
    kills: 0,
    lingyunGained: 0,
    events: [],
    tickMs: 1000,
    pushEveryMs: 3000,
    ...overrides,
  };
}

/** 只回 zone 域的成功体；其余命令返回 null（不干预）。 */
function zoneHandler(overrides: Partial<Record<'online' | 'visibility', MockHandler>> = {}): MockHandler {
  return async (request: Req) => {
    if (request.cmd !== ZONE_CMD.cmd) return null;
    // load() 会并发拉列表 + 进度；这里给最小成功体，避免 load() 在列表处提前 catch
    if (request.subCmd === ZONE_CMD.zones) {
      return ok({ total: 0, playerPower: 100, currentZone: null, idleTarget: null, zones: [], breakthrough: [] });
    }
    if (request.subCmd === ZONE_CMD.progress) return fail('ZONE_NOT_FOUND');
    if (request.subCmd === ZONE_CMD.online) {
      const handler = overrides.online;
      return handler === undefined ? ok(frame()) : handler(request);
    }
    if (request.subCmd === ZONE_CMD.visibility) {
      const handler = overrides.visibility;
      return handler === undefined ? ok({ visible: true }) : handler(request);
    }
    return null;
  };
}

describe('ZoneStore · loadOnline（只读实况，不本地推进）', () => {
  it('成功：写入 online 帧，且不碰 loading（不把面板换成骨架屏）', async () => {
    const harness = createPanelHarness({ handler: zoneHandler() });
    await harness.connect();
    harness.root.zone.loading = false;
    await harness.root.zone.loadOnline();
    expect(harness.root.zone.online?.floor).toBe(1);
    expect(harness.root.zone.online?.floorKills).toBe(12);
    expect(harness.root.zone.loading).toBe(false);
    expect(harness.root.zone.error).toBeNull();
  });

  it('业务失败（老服务端）：静默，online 保持 null，不写 error', async () => {
    const harness = createPanelHarness({
      handler: zoneHandler({ online: () => fail('CHARACTER_NOT_FOUND') }),
    });
    await harness.connect();
    await harness.root.zone.loadOnline();
    expect(harness.root.zone.online).toBeNull();
    expect(harness.root.zone.error).toBeNull();
  });

  it('传输异常（errorCode 500）：静默吞掉，不抛', async () => {
    const harness = createPanelHarness({
      handler: zoneHandler({ online: () => ({ errorCode: 500, errorMessage: 'boom' }) }),
    });
    await harness.connect();
    await expect(harness.root.zone.loadOnline()).resolves.toBeUndefined();
    expect(harness.root.zone.online).toBeNull();
  });

  it('load() 同时拉实况：请求里包含 (100,5)', async () => {
    const harness = createPanelHarness({ handler: zoneHandler() });
    await harness.connect();
    await harness.root.zone.load();
    const request = harness.requests.find((r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.online);
    expect(request).toBeDefined();
    expect(harness.root.zone.online?.floorKills).toBe(12);
  });
});

describe('ZoneStore · handleNotification（服务端推送 → 覆盖帧）', () => {
  it('(100,5) 推送覆盖 online，并对事件给提示', async () => {
    const harness = createPanelHarness({ handler: zoneHandler() });
    harness.root.zone.handleNotification({
      subCmd: ZONE_CMD.online,
      data: frame({ floor: 2, events: ['floor_up'] }),
    });
    expect(harness.root.zone.online?.floor).toBe(2);
    expect(harness.root.toast.toasts.some((t) => t.title === '历练涨层')).toBe(true);
  });

  it('§22 突破事件（realm_unlocked）给出「已突破」提示，且帧里的 clears 落库', async () => {
    const harness = createPanelHarness({ handler: zoneHandler() });
    harness.root.zone.handleNotification({
      subCmd: ZONE_CMD.online,
      data: frame({ cleared: true, clears: 1, events: ['boss_defeated', 'realm_unlocked'] }),
    });
    expect(harness.root.zone.online?.clears).toBe(1);
    expect(
      harness.root.toast.toasts.some((t) => t.title === '突破成功，已录入秘境页面'),
    ).toBe(true);
  });

  it('未知事件：帧照常存，不弹提示、不崩', () => {
    const harness = createPanelHarness({ handler: zoneHandler() });
    harness.root.zone.handleNotification({
      subCmd: ZONE_CMD.online,
      data: frame({ events: ['mystery' as ZoneOnlineData['events'][number]] }),
    });
    expect(harness.root.zone.online).not.toBeNull();
    expect(harness.root.toast.toasts).toHaveLength(0);
  });

  it('非 (100,5) 推送 / 空 / 非法 data：一律忽略', () => {
    const harness = createPanelHarness({ handler: zoneHandler() });
    harness.root.zone.handleNotification({ subCmd: 1, data: frame() });
    harness.root.zone.handleNotification({ subCmd: ZONE_CMD.online });
    harness.root.zone.handleNotification({ subCmd: ZONE_CMD.online, data: null });
    harness.root.zone.handleNotification({ subCmd: ZONE_CMD.online, data: 'nope' });
    expect(harness.root.zone.online).toBeNull();
    expect(harness.root.toast.toasts).toHaveLength(0);
  });
});

describe('ZoneStore · reportVisibility（只报可见性，不报时长）', () => {
  it('发出 (100,6) 且请求体只有 visible', async () => {
    const harness = createPanelHarness({ handler: zoneHandler() });
    await harness.connect();
    harness.root.zone.reportVisibility(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // 连上时会自动上报一次 visible=true，因此取最后一次
    const requests = harness.requests.filter(
      (r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.visibility,
    );
    const request = requests[requests.length - 1];
    expect(request).toBeDefined();
    expect(request?.data).toEqual({ visible: false });
    const body = request?.data as Record<string, unknown>;
    for (const key of Object.keys(body)) {
      expect(key).toBe('visible');
    }
  });

  it('连接建立即自动上报 visible=true（纠正上一次可能丢在断链里的 hidden）', async () => {
    const harness = createPanelHarness({ handler: zoneHandler() });
    await harness.connect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = harness.requests.find(
      (r) => r.cmd === ZONE_CMD.cmd && r.subCmd === ZONE_CMD.visibility,
    );
    expect(request?.data).toEqual({ visible: true });
  });

  it('失败静默（业务失败不抛、不写 error）', async () => {
    const harness = createPanelHarness({
      handler: zoneHandler({ visibility: () => fail('INVALID_PARAM') }),
    });
    await harness.connect();
    expect(() => harness.root.zone.reportVisibility(true)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.root.zone.error).toBeNull();
  });
});
