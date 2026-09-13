/**
 * ConnectionStatus —— 连接状态条（容器层，读 `ConnectionStore`）。
 *
 * 展示：状态机状态（antd `Badge` 语义色）/ 关联策略 / 延迟 / 心跳 ack / 服务器时钟偏移 / 手动重连。
 * 状态 → 徽标与文案的映射是**本文件唯一的展示映射**（不散落到别处，避免文案双份）。
 */
import { observer } from 'mobx-react-lite';
import { Badge, Button, Divider, Flex, Space, Typography } from 'antd';
import type { ConnectionState } from '@idle-path/ionet-transport';
import { useRootStore } from '../app/root-context.js';

type BadgeStatus = 'success' | 'processing' | 'warning' | 'error' | 'default';

const STATE_PRESENTATION: Record<ConnectionState, { badge: BadgeStatus; text: string }> = {
  idle: { badge: 'default', text: '未连接' },
  connecting: { badge: 'processing', text: '连接中' },
  online: { badge: 'success', text: '在线' },
  reconnecting: { badge: 'warning', text: '重连中' },
  offline: { badge: 'warning', text: '已暂停（后台/离线）' },
  failed: { badge: 'error', text: '连接失败' },
  closed: { badge: 'default', text: '已断开' },
};

function formatMs(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}ms`;
}

export const ConnectionStatus = observer(function ConnectionStatus() {
  const { connection, client } = useRootStore();
  const presentation = STATE_PRESENTATION[connection.state];

  return (
    <Flex justify="space-between" align="center" wrap gap="small" data-testid="connection-status">
      <Space separator={<Divider orientation="vertical" />} wrap>
        <Badge status={presentation.badge} text={presentation.text} data-testid="connection-state" />
        <Typography.Text type="secondary">
          {client.ionet.correlationStrategy === 'reqId' ? 'reqId 并发' : '串行队列'}
        </Typography.Text>
        <Typography.Text type="secondary" data-testid="connection-latency">
          延迟 {formatMs(connection.latencyMs)}
        </Typography.Text>
        <Typography.Text type="secondary" data-testid="connection-heartbeat">
          心跳 ack {connection.heartbeatAcks}
        </Typography.Text>
        <Typography.Text type="secondary" data-testid="connection-clock">
          时钟偏移 {formatMs(connection.serverTimeOffsetMs)}
        </Typography.Text>
        {connection.detail !== undefined ? (
          <Typography.Text type="secondary" data-testid="connection-detail">
            {connection.detail}
          </Typography.Text>
        ) : null}
      </Space>
      {connection.isOnline ? (
        <Button onClick={() => connection.disconnect()} disabled={connection.actionPending} data-testid="connection-disconnect">
          断开连接
        </Button>
      ) : (
        <Button
          type="primary"
          onClick={() => void connection.connect()}
          loading={connection.actionPending}
          data-testid="connection-connect"
        >
          重新连接
        </Button>
      )}
    </Flex>
  );
});
