/**
 * ConnectionStatusBadge —— 紧凑连接状态（HUD 用）。
 *
 * 只显示「状态 + 延迟」两个玩家真正关心的量；`reqId 并发` / `心跳 ack` / `时钟偏移` /
 * `handshake ok` 这些**实现细节**移到 `ConnectionDiagnostics`（点击展开），
 * 不再占据常驻信息条（原型把它们全铺在 HUD 上，既有噪音又挤爆窄屏）。
 *
 * 状态 → 徽标/文案的映射是**本文件唯一定义**，诊断面板复用同一份，避免文案双轨。
 */
import { observer } from 'mobx-react-lite';
import { Badge, Space, Typography } from 'antd';
import type { ConnectionState } from '@idle-path/ionet-transport';
import { useRootStore } from '../app/root-context.js';

type BadgeStatus = 'success' | 'processing' | 'warning' | 'error' | 'default';

export const STATE_PRESENTATION: Record<ConnectionState, { badge: BadgeStatus; text: string }> = {
  idle: { badge: 'default', text: '未连接' },
  connecting: { badge: 'processing', text: '连接中' },
  online: { badge: 'success', text: '在线' },
  reconnecting: { badge: 'warning', text: '重连中' },
  offline: { badge: 'warning', text: '已暂停' },
  failed: { badge: 'error', text: '连接失败' },
  closed: { badge: 'default', text: '已断开' },
};

export function formatLatency(value: number | null): string {
  return value === null ? '' : `${Math.round(value)}ms`;
}

export const ConnectionStatusBadge = observer(function ConnectionStatusBadge() {
  const { connection } = useRootStore();
  const presentation = STATE_PRESENTATION[connection.state];

  return (
    <Space size={4} align="center" data-testid="connection-badge">
      <Badge status={presentation.badge} />
      <Typography.Text data-testid="connection-badge-text">{presentation.text}</Typography.Text>
      <Typography.Text type="secondary" data-testid="connection-latency">
        {formatLatency(connection.latencyMs)}
      </Typography.Text>
    </Space>
  );
});
