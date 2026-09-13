/**
 * 设置面板的**展示翻译**（纯函数，单独成文件便于单测）。
 *
 * 只把协议状态翻译成玩家语言，不做任何连接判定、不读 store。
 * 刻意**不含** reqId 并发 / 心跳 ack / 时钟偏移 / handshake 等实现细节：
 * 那些属于诊断视图（`ConnectionDiagnostics`），不铺到玩家设置面板上。
 */
import { REALMS, type ConnectionState } from '@idle-path/ionet-transport';

/** 连接状态 → 玩家文案。未知态给中性文案，绝不回显协议原始值。 */
const STATE_LABELS: Record<ConnectionState, string> = {
  idle: '未连接',
  connecting: '连接中',
  online: '在线',
  reconnecting: '重连中',
  offline: '已暂停',
  failed: '连接失败',
  closed: '已断开',
};

export function connectionStateLabel(state: ConnectionState): string {
  return STATE_LABELS[state] ?? '未知状态';
}

/** 主题态 → 中文名（只有 light / dark 两态，紧凑恒开不在此列）。 */
export function themeModeLabel(mode: string): string {
  return mode === 'dark' ? '暗色' : '亮色';
}

/** 延迟展示：`null` / 非有限数给占位符（诊断项，仅在运行状态里显示这一项）。 */
export function latencyText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(value)} 毫秒`;
}

/** 缺值时统一占位符，避免渲染空白或 `undefined` 字样。 */
export function valueText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value);
}

/**
 * 境界序号 → 玩家文案（`REALMS[realm-1]`，与 HUD / 境界面板口径一致）。
 * 非有限 / 越界 / 缺省一律 `—`，绝不回显原始序号之外的东西。
 */
export function realmText(realm: number | null | undefined): string {
  if (realm === null || realm === undefined || !Number.isFinite(realm)) return '—';
  const name = REALMS[realm - 1];
  return name === undefined ? `第 ${realm} 境` : `第 ${realm} 境 · ${name}`;
}

/**
 * 开发者工具的一次性注入量（灵韵 / 混沌石共用）。
 * 纯常量表，与 `QuantityInput` 的 `min`/`max` 配套；改这里即改 UI 上限。
 */
export const DEV_GRANT_MIN = 1;
export const DEV_GRANT_MAX = 1000000;
export const DEV_GRANT_DEFAULT = 1000;
