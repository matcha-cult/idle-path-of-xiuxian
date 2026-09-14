/**
 * 历练峰在线面板的**纯展示逻辑**（P3.0 T6）。
 *
 * 只做「把服务端权威帧翻译成玩家看得懂的状态/进度/提示」，**不含任何推进规则**：
 * 涨层、产出、在线判定全部在服务端（R2 §4.2：客户端不本地涨层、不本地算产出）。
 * 放同目录独立文件是为了能脱离 React 单测（`11-...md` §4：组件里不内联长映射表与公式）。
 */
import type { ZoneOnlineData, ZoneOnlineEvent } from '@idle-path/ionet-transport';

/** 事件 → 界面标签（未知事件返回 `null`，绝不回显协议原文）。 */
const EVENT_LABELS: Record<ZoneOnlineEvent, string> = {
  floor_up: '涨层',
  boss_floor: '进入 Boss 层',
  boss_defeated: '击败 Boss',
  realm_unlocked: '突破成功',
  stuck: '战力不足',
};

/** 一个事件的中文标签；未知事件 → `null`。 */
export function eventLabelOf(event: string): string | null {
  return EVENT_LABELS[event as ZoneOnlineEvent] ?? null;
}

/** 帧里的已知事件翻译成标签（未知事件丢弃）。 */
export function eventLabelsOf(frame: ZoneOnlineData | null): string[] {
  if (frame === null) return [];
  return frame.events.flatMap((event) => {
    const label = eventLabelOf(event);
    return label === null ? [] : [label];
  });
}

/** 历练是否**正在推进**（服务端口径：在线 + 在秘境峰 + reason=ok）。 */
export function isAdvancing(frame: ZoneOnlineData | null): boolean {
  return frame !== null && frame.online && frame.exploring && frame.reason === 'ok';
}

/**
 * 本层击杀进度百分比（0~100 整数，供 antd `Progress` 用）。
 *
 * 边界：`frame` 为空 / `killsPerFloor <= 0` / 非有限数 → 0（不产生 `NaN` 宽度）；
 * 超过 100 夹到 100（服务端涨层与帧到达之间有窗口，别画成越界）。
 */
export function floorProgressPercent(frame: ZoneOnlineData | null): number {
  if (frame === null) return 0;
  const kills = frame.floorKills;
  const need = frame.killsPerFloor;
  if (!Number.isFinite(kills) || !Number.isFinite(need) || need <= 0) return 0;
  const percent = Math.round((kills / need) * 100);
  return Math.max(0, Math.min(100, percent));
}

/**
 * 状态一句话（面板副标题）。
 *
 * 「在线」的服务端口径是「活着的 WS 会话 + 页面可见」，所以断线与切后台都表现为暂停 ——
 * 这里把 `reason` 翻成人话，而不是让玩家以为「打怪坏了」。
 */
export function statusText(frame: ZoneOnlineData | null): string {
  if (frame === null) return '尚未读取历练实况';
  switch (frame.reason) {
    case 'ok':
      return `正在历练 · 每 ${Math.round(frame.tickMs / 1000)} 秒结算一次`;
    case 'hidden':
      return '历练已暂停：页面切到后台时不计在线';
    case 'no_session':
      return '历练已暂停：连接断开时服务端不会推进';
    case 'no_battle':
      // §22：没在战斗 —— 两条入场路径都告诉玩家（地图上的秘境石台 / 秘境页面重复挑战）
      return '未在秘境中：到「第八峰·后山」的秘境石台突破，或从秘境页面重复挑战';
    default:
      return '历练状态未知';
  }
}

/**
 * 层数文案：「第 N / M 层」；`maxFloor` 非法时退化为「第 N 层」。
 * `floor <= 0`（还没读到 / 未进入秘境）→ `—`，绝不显示「第 0 层」。
 */
export function floorLabel(frame: ZoneOnlineData | null): string {
  if (frame === null || !Number.isFinite(frame.floor) || frame.floor <= 0) return '—';
  const max = frame.maxFloor;
  if (!Number.isFinite(max) || max <= 0) return `第 ${frame.floor} 层`;
  return `第 ${Math.min(frame.floor, max)} / ${max} 层`;
}

/** 本层击杀文案：「K / N」。 */
export function floorKillsLabel(frame: ZoneOnlineData | null): string {
  if (frame === null) return '—';
  return `${frame.floorKills} / ${frame.killsPerFloor}`;
}

/**
 * 卡层提示（用服务端给的 `shortfall`，**不在前端重算门槛**）；不卡层 → `null`。
 */
export function stuckText(frame: ZoneOnlineData | null): string | null {
  if (frame === null || !frame.stuck) return null;
  const shortfall = Number.isFinite(frame.shortfall) ? Math.max(0, frame.shortfall) : 0;
  return `战力不足，还差 ${shortfall}（仍在原地刷本层，有产出、无进度）`;
}

/**
 * §22 突破成功后的引导（**基于稳定状态而非瞬时事件**，读接口也能显示）。
 *
 * 条件：已突破（`clears ≥ 1`）且当前不在战斗中（`reason === 'no_battle'`）。
 * 面板据此告诉玩家「这个秘境现在在哪能用」—— 秘境页面重复挑战 / 设为挂机点。
 */
export function realmUnlockedHint(frame: ZoneOnlineData | null): string | null {
  if (frame === null) return null;
  if (frame.reason !== 'no_battle') return null;
  if (!Number.isFinite(frame.clears) || frame.clears < 1) return null;
  const name = frame.zone?.name ?? '该秘境';
  return `「${name}」已突破：可在秘境页面重复挑战，历练秘境还能设为挂机点`;
}

/**
 * 节奏说明（把服务端的节拍与节流如实告诉玩家，避免「怎么不涨」的疑问）。
 *
 * ⚠️ 只是文案：客户端**不得**据此本地推进（R2 §4.2）。
 */
export function rhythmText(frame: ZoneOnlineData | null): string {
  if (frame === null) return '';
  const tickSeconds = Math.max(1, Math.round(frame.tickMs / 1000));
  const pushSeconds = Math.max(1, Math.round(frame.pushEveryMs / 1000));
  return `服务端每 ${tickSeconds} 秒结算一次，最多每 ${pushSeconds} 秒推送一次实况`;
}

/** 本次推送窗口内的产出摘要（读了接口则为 0 → 不显示）。 */
export function summaryText(frame: ZoneOnlineData | null): string | null {
  if (frame === null || frame.kills <= 0) return null;
  const lingyun = Number.isFinite(frame.lingyunGained) ? frame.lingyunGained : 0;
  return `本次 +${frame.kills} 击杀 · +${lingyun} 灵韵`;
}
