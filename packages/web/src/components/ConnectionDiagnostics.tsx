/**
 * ConnectionDiagnostics —— 连接诊断气泡（点击连接状态展开）。
 *
 * 把「实现细节」从常驻 HUD 收进按需展开的面板：请求关联策略、心跳 ack、时钟偏移、
 * 断线原因（closeCode），以及断开/重连动作。这样常态界面只留玩家关心的「在线 + 延迟」。
 */
import { observer } from 'mobx-react-lite';
import { Button, Descriptions, Flex, Popover, theme } from 'antd';
import type { DescriptionsProps } from 'antd';
import { useRootStore } from '../app/root-context.js';
import { ConnectionStatusBadge, STATE_PRESENTATION, formatLatency } from './ConnectionStatusBadge.js';

export const ConnectionDiagnostics = observer(function ConnectionDiagnostics() {
  const { connection, client } = useRootStore();
  const { token } = theme.useToken();
  const presentation = STATE_PRESENTATION[connection.state];

  const items: DescriptionsProps['items'] = [
    {
      key: 'state',
      label: '状态',
      children: connection.detail === undefined ? presentation.text : `${presentation.text}（${connection.detail}）`,
    },
    {
      key: 'strategy',
      label: '请求关联',
      children: client.ionet.correlationStrategy === 'reqId' ? 'reqId 并发' : '串行队列',
    },
    { key: 'latency', label: '延迟', children: formatLatency(connection.latencyMs) || '—' },
    { key: 'heartbeat', label: '心跳 ack', children: connection.heartbeatAcks },
    {
      key: 'clock',
      label: '时钟偏移',
      // 后端当前不返回 serverTime（协议 Q6 未定），此处如实显示占位而不是假数值
      children: connection.serverTimeOffsetMs === null ? '服务端未提供' : formatLatency(connection.serverTimeOffsetMs),
    },
  ];

  const content = (
    <Flex vertical gap={token.paddingXS} style={{ width: 280 }} data-testid="connection-diagnostics">
      <Descriptions column={1} colon={false} items={items} />
      {connection.isOnline ? (
        <Button danger block onClick={() => connection.disconnect()} data-testid="connection-disconnect">
          断开连接
        </Button>
      ) : (
        <Button
          type="primary"
          block
          loading={connection.actionPending}
          onClick={() => void connection.connect()}
          data-testid="connection-connect"
        >
          重新连接
        </Button>
      )}
    </Flex>
  );

  return (
    <Popover content={content} title="连接诊断" trigger="click" placement="bottomRight">
      <span data-testid="connection-diagnostics-trigger">
        <ConnectionStatusBadge />
      </span>
    </Popover>
  );
});
