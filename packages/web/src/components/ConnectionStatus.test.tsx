/**
 * ConnectionStatus：状态映射 / 指标展示 / 重连与断开按钮。
 */
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ConnectionState } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../test/helpers/panel-harness.js';
import { ConnectionStatus } from './ConnectionStatus.js';

const CASES: Array<{ state: ConnectionState; text: string }> = [
  { state: 'idle', text: '未连接' },
  { state: 'connecting', text: '连接中' },
  { state: 'online', text: '在线' },
  { state: 'reconnecting', text: '重连中' },
  { state: 'offline', text: '已暂停（后台/离线）' },
  { state: 'failed', text: '连接失败' },
  { state: 'closed', text: '已断开' },
];

describe('ConnectionStatus', () => {
  it.each(CASES)('状态 $state → 展示「$text」', ({ state, text }) => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.connection.handleStateChange(state, undefined);
    });
    harness.render(<ConnectionStatus />);
    expect(screen.getByTestId('connection-state')).toHaveTextContent(text);
  });

  it('展示关联策略与三项指标（无数据时显示占位 —）', () => {
    const harness = createPanelHarness();
    harness.render(<ConnectionStatus />);
    expect(screen.getByText('reqId 并发')).toBeInTheDocument();
    expect(screen.getByTestId('connection-latency')).toHaveTextContent('延迟 —');
    expect(screen.getByTestId('connection-heartbeat')).toHaveTextContent('心跳 ack 0');
    expect(screen.getByTestId('connection-clock')).toHaveTextContent('时钟偏移 —');
  });

  it('有指标时按毫秒展示', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.connection.latencyMs = 42.4;
      harness.root.connection.heartbeatAcks = 3;
      harness.root.connection.serverTimeOffsetMs = -120.6;
    });
    harness.render(<ConnectionStatus />);
    expect(screen.getByTestId('connection-latency')).toHaveTextContent('延迟 42ms');
    expect(screen.getByTestId('connection-heartbeat')).toHaveTextContent('心跳 ack 3');
    expect(screen.getByTestId('connection-clock')).toHaveTextContent('时钟偏移 -121ms');
  });

  it('离线时显示「重新连接」，在线时显示「断开连接」', () => {
    const harness = createPanelHarness();
    harness.render(<ConnectionStatus />);
    expect(screen.getByTestId('connection-connect')).toBeInTheDocument();

    act(() => {
      harness.seed(() => {
        harness.root.connection.handleStateChange('online', 'handshake ok');
      });
    });
    expect(screen.getByTestId('connection-disconnect')).toBeInTheDocument();
    expect(screen.getByTestId('connection-detail')).toHaveTextContent('handshake ok');
  });

  it('点击「断开连接」切到 closed 状态', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.connection.handleStateChange('online', undefined);
    });
    harness.render(<ConnectionStatus />);

    await userEvent.click(screen.getByTestId('connection-disconnect'));
    expect(harness.root.connection.state).toBe('closed');
  });

  it('点击「重新连接」真的建立连接（假适配器下变为 online）', async () => {
    const harness = createPanelHarness();
    harness.render(<ConnectionStatus />);

    await userEvent.click(screen.getByTestId('connection-connect'));
    // 不 spy（mobx autoBind 的属性不可重定义），直接断言可观察结果
    await waitFor(() => expect(harness.root.connection.state).toBe('online'));
  });
});
