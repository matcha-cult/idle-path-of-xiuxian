/**
 * ConnectionDiagnostics：默认收起、展开后显示诊断项与连接动作。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createPanelHarness } from '../../test/helpers/panel-harness.js';
import { ConnectionDiagnostics } from './ConnectionDiagnostics.js';

describe('ConnectionDiagnostics', () => {
  it('默认只显示状态徽标，诊断项不出现在页面上', () => {
    const harness = createPanelHarness();
    harness.render(<ConnectionDiagnostics />);
    expect(screen.getByTestId('connection-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('connection-diagnostics')).toBeNull();
  });

  it('点击后在气活里显示关联策略/心跳/时钟偏移与断线原因', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.connection.handleStateChange('online', 'handshake ok');
      harness.root.connection.heartbeatAcks = 7;
    });
    harness.render(<ConnectionDiagnostics />);

    await userEvent.click(screen.getByTestId('connection-diagnostics-trigger'));

    await waitFor(() => expect(screen.getByTestId('connection-diagnostics')).toBeInTheDocument());
    expect(screen.getByText(/reqId 并发/)).toBeInTheDocument();
    expect(screen.getByText(/handshake ok/)).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    // 后端未提供 serverTime → 如实标注，不显示假数值
    expect(screen.getByText('服务端未提供')).toBeInTheDocument();
  });

  it('在线时提供「断开连接」并生效', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.connection.handleStateChange('online', undefined);
    });
    harness.render(<ConnectionDiagnostics />);

    await userEvent.click(screen.getByTestId('connection-diagnostics-trigger'));
    await userEvent.click(await screen.findByTestId('connection-disconnect'));
    expect(harness.root.connection.state).toBe('closed');
  });

  it('离线时提供「重新连接」并能连上', async () => {
    const harness = createPanelHarness();
    harness.render(<ConnectionDiagnostics />);

    await userEvent.click(screen.getByTestId('connection-diagnostics-trigger'));
    await userEvent.click(await screen.findByTestId('connection-connect'));

    await waitFor(() => expect(harness.root.connection.state).toBe('online'));
  });
});
