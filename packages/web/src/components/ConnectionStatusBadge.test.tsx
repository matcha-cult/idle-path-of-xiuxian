/**
 * ConnectionStatusBadge：状态映射、延迟显示、实现细节不外露。
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConnectionState } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../test/helpers/panel-harness.js';
import { ConnectionStatusBadge } from './ConnectionStatusBadge.js';

const CASES: Array<{ state: ConnectionState; text: string }> = [
  { state: 'idle', text: '未连接' },
  { state: 'connecting', text: '连接中' },
  { state: 'online', text: '在线' },
  { state: 'reconnecting', text: '重连中' },
  { state: 'offline', text: '已暂停' },
  { state: 'failed', text: '连接失败' },
  { state: 'closed', text: '已断开' },
];

describe('ConnectionStatusBadge', () => {
  it.each(CASES)('状态 $state → 文案「$text」', ({ state, text }) => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.connection.handleStateChange(state, undefined);
    });
    harness.render(<ConnectionStatusBadge />);
    expect(screen.getByTestId('connection-badge-text')).toHaveTextContent(text);
  });

  it('无延迟数据时延迟位为空（不显示 undefined/null）', () => {
    const harness = createPanelHarness();
    harness.render(<ConnectionStatusBadge />);
    expect(screen.getByTestId('connection-latency')).toHaveTextContent('');
  });

  it('有延迟时按毫秒取整显示', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.connection.latencyMs = 42.6;
    });
    harness.render(<ConnectionStatusBadge />);
    expect(screen.getByTestId('connection-latency')).toHaveTextContent('43ms');
  });

  it('常驻不显示实现细节（reqId/心跳/时钟偏移）', () => {
    const harness = createPanelHarness();
    harness.render(<ConnectionStatusBadge />);
    expect(screen.queryByText(/reqId/)).toBeNull();
    expect(screen.queryByText(/心跳/)).toBeNull();
    expect(screen.queryByText(/时钟偏移/)).toBeNull();
  });
});
