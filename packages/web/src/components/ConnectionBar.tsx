import { observer } from 'mobx-react-lite';
import { useRootStore } from '../app/root-context.js';

const STATE_LABEL: Record<string, string> = {
  idle: '未连接',
  connecting: '连接中',
  online: '在线',
  reconnecting: '重连中',
  offline: '已暂停（后台/离线）',
  failed: '连接失败',
  closed: '已断开',
};

/** 连接状态条：状态机状态 / 延迟 / 心跳 ack / 服务器时间偏移（02 §3.3）。 */
export const ConnectionBar = observer(function ConnectionBar() {
  const { connection, client } = useRootStore();
  const tone = connection.isOnline ? 'ok' : connection.isBusy ? 'warn' : 'bad';
  return (
    <div className={`conn-bar conn-bar--${tone}`}>
      <span className="conn-bar__dot" />
      <strong>{STATE_LABEL[connection.state] ?? connection.state}</strong>
      <span className="conn-bar__meta">
        {client.ionet.correlationStrategy === 'reqId' ? 'reqId 并发' : '串行'}
        {connection.latencyMs !== null ? ` · ${Math.round(connection.latencyMs)}ms` : ''}
        {` · 心跳 ack ${connection.heartbeatAcks}`}
        {connection.serverTimeOffsetMs !== null
          ? ` · 服务器时钟偏移 ${Math.round(connection.serverTimeOffsetMs)}ms`
          : ''}
      </span>
      {connection.detail !== undefined ? <span className="conn-bar__detail">{connection.detail}</span> : null}
      <span className="conn-bar__spacer" />
      <span className="conn-bar__url">{client.ionet.getState() === 'online' ? 'ws /ws' : ''}</span>
      {connection.isOnline ? (
        <button className="btn btn--ghost" onClick={() => connection.disconnect()} disabled={connection.actionPending}>
          断开
        </button>
      ) : (
        <button className="btn btn--ghost" onClick={() => void connection.connect()} disabled={connection.actionPending}>
          重连
        </button>
      )}
    </div>
  );
});
