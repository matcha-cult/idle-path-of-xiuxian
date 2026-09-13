/**
 * GameClient —— 应用侧对 transport 层的唯一装配点。
 *
 * 把三样东西绑在一起，Store 只依赖本类：
 * - `ionet`：WS 连接状态机（`?token=` 握手 / 心跳 / 退避重连 / reqId 并发）；
 * - `rest`：REST 通道（认证 + 角色基础）；
 * - `game`：46 个 Action 的 typed API；
 * - `notifications`：`kind='notification'` 推送路由总线。
 */
import {
  GameApi,
  IonetClient,
  RestApi,
  type BusinessError,
  type ConnectionState,
  type FetchLike,
  type HeartbeatOptions,
  type IonetClientOptions,
  type LifecycleAdapter,
  type NotificationMessage,
  type ReconnectOptions,
  type SocketAdapterFactory,
} from '@idle-path/ionet-transport';
import { NotificationBus } from './notification-bus.js';

export interface ServerTimeInfo {
  serverTimeMs: number;
  offsetMs: number;
  rttMs: number;
}

export interface GameClientCallbacks {
  onStateChange(state: ConnectionState, detail?: string): void;
  onBusinessError(error: BusinessError): void;
  onServerTime(info: ServerTimeInfo): void;
  onNotification?(notification: NotificationMessage): void;
}

export interface GameClientOptions {
  /** WS 端点；缺省按当前页面推导同源 `/ws`。 */
  url?: string;
  /** REST 前缀；缺省 `/api`（同源，Vite 代理）。 */
  baseUrl?: string;
  fetchImpl?: FetchLike;
  /** 取当前 JWT（握手拼 `?token=`，REST 走 Bearer）。 */
  getToken: () => string | undefined;
  callbacks: GameClientCallbacks;
  heartbeat?: HeartbeatOptions | false;
  reconnect?: ReconnectOptions;
  requestTimeoutMs?: number;
  adapterFactory?: SocketAdapterFactory;
  lifecycle?: LifecycleAdapter;
  reqIdGenerator?: () => string;
  logger?: (...args: unknown[]) => void;
}

/** 同源 WS 端点推导：`ws(s)://<location.host>/ws`（PROTOCOL.md §1）。 */
export function resolveWsUrl(env: unknown = import.meta.env): string {
  const configured = (env as { VITE_WS_URL?: string } | undefined)?.VITE_WS_URL;
  if (typeof configured === 'string' && configured.length > 0) return configured;
  if (typeof location === 'undefined') return 'ws://127.0.0.1:3000/ws';
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

/** 同源 REST 前缀推导（Vite 代理 `/api` → 后端）。 */
export function resolveApiBaseUrl(env: unknown = import.meta.env): string {
  const configured = (env as { VITE_API_BASE_URL?: string } | undefined)?.VITE_API_BASE_URL;
  if (typeof configured === 'string' && configured.length > 0) return configured;
  return '/api';
}

export class GameClient {
  readonly ionet: IonetClient;
  readonly rest: RestApi;
  readonly game: GameApi;
  readonly notifications = new NotificationBus();

  constructor(options: GameClientOptions) {
    const ionetOptions: IonetClientOptions = {
      url: options.url ?? resolveWsUrl(),
      authHandler: options.getToken,
      onStateChange: options.callbacks.onStateChange,
      onBusinessError: options.callbacks.onBusinessError,
      onServerTime: options.callbacks.onServerTime,
      onNotification: (notification) => {
        this.notifications.dispatch(notification);
        options.callbacks.onNotification?.(notification);
      },
    };
    if (options.heartbeat !== undefined) ionetOptions.heartbeat = options.heartbeat;
    if (options.reconnect !== undefined) ionetOptions.reconnect = options.reconnect;
    if (options.requestTimeoutMs !== undefined) ionetOptions.requestTimeoutMs = options.requestTimeoutMs;
    if (options.adapterFactory !== undefined) ionetOptions.adapterFactory = options.adapterFactory;
    if (options.lifecycle !== undefined) ionetOptions.lifecycle = options.lifecycle;
    if (options.reqIdGenerator !== undefined) ionetOptions.reqIdGenerator = options.reqIdGenerator;
    if (options.logger !== undefined) ionetOptions.logger = options.logger;

    this.ionet = new IonetClient(ionetOptions);
    this.rest = new RestApi({
      baseUrl: options.baseUrl ?? resolveApiBaseUrl(),
      tokenProvider: options.getToken,
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    });
    this.game = new GameApi(this.ionet);
  }

  get state(): ConnectionState {
    return this.ionet.getState();
  }

  connect(): Promise<void> {
    return this.ionet.connect();
  }

  /**
   * 断开连接并清空连接态（登出时调用）：不清 session，仅网络面。
   */
  disconnect(detail = 'app-close'): void {
    this.ionet.close(detail);
  }

  /** token 轮换后重建连接（如重新登录）。 */
  async reconnectWithToken(): Promise<void> {
    this.ionet.close('token-rotate');
    await this.ionet.connect();
  }
}
