/**
 * ConnectionStore —— 连接状态 / 延迟 / 心跳 / 服务器时间偏移的只读视图（02 §3.3、§4.1）。
 *
 * 数据源是 transport 层 `IonetClient` 的回调（由 `GameClient` 转发），
 * 本 Store 不直接驱动 socket，避免状态双写。
 */
import { makeAutoObservable, runInAction } from 'mobx';
import type { ConnectionState, IonetClient } from '@idle-path/ionet-transport';

export interface ServerTimeInfo {
  serverTimeMs: number;
  offsetMs: number;
  rttMs: number;
}

export class ConnectionStore {
  /** 连接状态机当前态（idle/connecting/online/reconnecting/offline/failed/closed）。 */
  state: ConnectionState = 'idle';
  detail: string | undefined;
  /** 最近一次请求 RTT（毫秒）。 */
  latencyMs: number | null = null;
  /** 心跳累计 ack 次数（存活证据）。 */
  heartbeatAcks = 0;
  lastHeartbeatAckAt: number | null = null;
  /** 服务端时间 − 本地时间（毫秒）；Q6 未定，服务端未提供时为 null。 */
  serverTimeOffsetMs: number | null = null;
  /** 上一次请求的服务器时间样本。 */
  lastServerTimeMs: number | null = null;
  /** 用户主动点击的「连接/断开」动作是否在途。 */
  actionPending = false;

  constructor(private readonly client: IonetClient) {
    makeAutoObservable<this, 'client'>(this, { client: false }, { autoBind: true });
  }

  get isOnline(): boolean {
    return this.state === 'online';
  }

  get isBusy(): boolean {
    return this.state === 'connecting' || this.state === 'reconnecting';
  }

  /** 由 GameClient 的 onStateChange 回调驱动。 */
  handleStateChange(state: ConnectionState, detail?: string): void {
    runInAction(() => {
      this.state = state;
      this.detail = detail;
    });
  }

  /** 由 GameClient 的 onServerTime 回调驱动。 */
  handleServerTime(info: ServerTimeInfo): void {
    runInAction(() => {
      this.serverTimeOffsetMs = info.offsetMs;
      this.lastServerTimeMs = info.serverTimeMs;
    });
  }

  /** 轮询 transport 层的实时指标（心跳次数 / RTT）。 */
  refreshMetrics(): void {
    runInAction(() => {
      this.heartbeatAcks = this.client.heartbeatAcks;
      this.lastHeartbeatAckAt = this.client.lastHeartbeatAckAt;
      this.latencyMs = this.client.latencyMs;
    });
  }

  /** 手动连接：失败时返回错误信息（Toast 由调用方决定）。 */
  async connect(): Promise<boolean> {
    runInAction(() => {
      this.actionPending = true;
    });
    try {
      await this.client.connect();
      this.refreshMetrics();
      return true;
    } catch (error) {
      this.handleStateChange(this.client.getState(), this.client.getStateDetail() ?? undefined);
      void error;
      return false;
    } finally {
      runInAction(() => {
        this.actionPending = false;
      });
    }
  }

  disconnect(): void {
    this.client.close('user-close');
    this.handleStateChange('closed', '用户主动断开');
  }
}
