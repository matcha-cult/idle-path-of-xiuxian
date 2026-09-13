/**
 * IonetClient —— 前端连接的唯一核心（02 §3.3）。
 *
 * 职责（协议层不在此重造，全部委托 A3 `@nbb-ionet/client-protocol`）：
 * - 连接状态机：`idle → connecting → online → reconnecting → …`；
 * - 握手鉴权：`authHandler()` 取 JWT → 拼 `?token=`（浏览器唯一可行通道，PROTOCOL.md §6）；
 * - 应用层心跳：`system.ping (1,1)` 每 15s 一发、10s 未收响应判定死链（PROTOCOL.md §7，免鉴权）；
 * - 退避重连：指数退避 + 抖动，`maxAttempts` 可限次（默认无限）；
 * - 生命周期：`visibilitychange` / `online|offline` 主动断开与恢复（02 §3.3）；
 * - 请求关联：默认 reqId 并发（A3 `RequestResponseAssociator`），`serial` 为兜底；
 * - 错误分层：传输层 `errorCode` + 业务层 `data.success === false`（06 §2）。
 */
import {
  classifyFrame,
  envelopeCodec,
  type NotificationMessage,
  type ResponseMessage,
  type WireFrame,
} from '@nbb-ionet/client-protocol';
import { BrowserSocketAdapter } from '../transport/browser-socket-adapter.js';
import type {
  SocketAdapter,
  SocketAdapterFactory,
  SocketCloseEvent,
} from '../transport/socket-adapter.js';
import { Correlation, defaultReqIdGenerator, type CorrelationStrategy } from './correlation.js';
import {
  assertResponseOk,
  BusinessError,
  ConnectionError,
  HandshakeError,
  ProtocolError,
  RequestTimeoutError,
  type ActionResult,
} from './errors.js';
import { BrowserLifecycleAdapter, NoopLifecycleAdapter, type LifecycleAdapter } from './lifecycle.js';

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'offline'
  | 'failed'
  | 'closed';

export interface HeartbeatOptions {
  /** 心跳间隔，默认 15000ms（PROTOCOL.md §7：≤ 服务端 30s 之半）。 */
  intervalMs?: number;
  /** 未收响应判死时限，默认 10000ms。 */
  timeoutMs?: number;
  /** 心跳路由，默认 system.ping = (1,1)。 */
  cmd?: number;
  subCmd?: number;
}

export interface ReconnectOptions {
  enabled?: boolean;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** `'infinite'`（默认）或最大尝试次数；超过 → `failed`。 */
  maxAttempts?: number | 'infinite';
  /** 抖动比例（0~1），默认 0.2；`random()` 可注入以便确定性测试。 */
  jitterRatio?: number;
  /** 后台/离线时暂停重连，等 visible/online 再恢复（默认 true）。 */
  respectLifecycle?: boolean;
  /** 握手被拒（如 401）是否也重连（默认 false，避免死循环）。 */
  reconnectOnHandshakeFailure?: boolean;
}

export interface SendOptions {
  headers?: Record<string, string>;
  traceId?: string;
  /** 覆盖本次请求超时。 */
  timeoutMs?: number;
  /**
   * 为 true 时**不**因 `data.success === false` 抛错，而是把业务失败体原样返回。
   * 用于「业务失败是预期分支」的 Action（如 zone.challenge、生成类接口）。
   */
  allowBusinessFailure?: boolean;
}

export interface IonetClientOptions {
  /** WS 端点，如 `ws://host:3000/ws`（PROTOCOL.md §1）。 */
  url: string;
  /** 适配器工厂；缺省用 BrowserSocketAdapter。每次（重）连新建实例。 */
  adapterFactory?: SocketAdapterFactory;
  /** 关联策略，默认 `'reqId'`（并发）。 */
  correlation?: CorrelationStrategy;
  /** reqId 生成器（默认 randomUUID）；注入以便测试/快照确定性。 */
  reqIdGenerator?: () => string;
  /** 应用层心跳；`false` 关闭。 */
  heartbeat?: false | HeartbeatOptions;
  reconnect?: ReconnectOptions;
  /** 握手凭据提供者；返回 undefined/'' 时不附带 token（未登录）。 */
  authHandler?: () => string | undefined | Promise<string | undefined>;
  /** 单请求超时，默认 10000ms。 */
  requestTimeoutMs?: number;
  /** 生命周期适配器；缺省在浏览器用 BrowserLifecycleAdapter，其余环境 Noop。 */
  lifecycle?: LifecycleAdapter;
  /** 是否接入生命周期；默认 true。 */
  lifecycleAware?: boolean;
  onStateChange?: (state: ConnectionState, detail?: string) => void;
  onNotification?: (notification: NotificationMessage) => void;
  onBusinessError?: (error: BusinessError) => void;
  onHandshakeRejected?: (error: HandshakeError) => void;
  /** 心跳/任意响应携带 serverTime 时回调（Q6 未定，兼容多种位置）。 */
  onServerTime?: (info: { serverTimeMs: number; offsetMs: number; rttMs: number }) => void;
  /** 可注入时钟/随机源，便于确定性测试。 */
  now?: () => number;
  random?: () => number;
  logger?: (...args: unknown[]) => void;
}

const DEFAULT_HEARTBEAT: Required<HeartbeatOptions> = {
  intervalMs: 15_000,
  timeoutMs: 10_000,
  cmd: 1,
  subCmd: 1,
};
const DEFAULT_RECONNECT: Required<Omit<ReconnectOptions, 'maxAttempts'>> & {
  maxAttempts: number | 'infinite';
} = {
  enabled: true,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  maxAttempts: 'infinite',
  jitterRatio: 0.2,
  respectLifecycle: true,
  reconnectOnHandshakeFailure: false,
};
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

interface PendingEntry {
  seq: number;
  cmd: number;
  subCmd: number;
  startedAt: number;
  resolve: (response: ResponseMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/** 把 `?token=` 拼进握手 URL（已带 query 时用 `&`）。 */
export function withToken(url: string, token: string | undefined): string {
  if (token === undefined || token === '') return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

/** ArrayBuffer/TextDecoder → 文本帧（PROTOCOL.md §1 默认 JSON 文本帧）。 */
function frameToText(frame: string | ArrayBuffer): string {
  if (typeof frame === 'string') return frame;
  const decoder = new TextDecoder();
  return decoder.decode(new Uint8Array(frame));
}

export class IonetClient {
  private readonly url: string;
  private readonly adapterFactory: SocketAdapterFactory;
  private readonly correlation: Correlation;
  private readonly heartbeat: Required<HeartbeatOptions> | false;
  private readonly reconnectOpts: typeof DEFAULT_RECONNECT;
  private readonly authHandler: (() => string | undefined | Promise<string | undefined>) | undefined;
  private readonly requestTimeoutMs: number;
  private readonly lifecycle: LifecycleAdapter;
  private readonly lifecycleAware: boolean;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly logger: (...args: unknown[]) => void;
  private readonly onStateChangeCb: ((state: ConnectionState, detail?: string) => void) | undefined;
  private readonly onNotificationCb: ((notification: NotificationMessage) => void) | undefined;
  private readonly onBusinessErrorCb: ((error: BusinessError) => void) | undefined;
  private readonly onHandshakeRejectedCb: ((error: HandshakeError) => void) | undefined;
  private readonly onServerTimeCb:
    | ((info: { serverTimeMs: number; offsetMs: number; rttMs: number }) => void)
    | undefined;

  private adapter: SocketAdapter | null = null;
  private state: ConnectionState = 'idle';
  private stateDetail: string | undefined;
  private connectPromise: Promise<void> | null = null;
  private resolveConnect: (() => void) | null = null;
  private rejectConnect: ((error: Error) => void) | null = null;
  private opened = false;
  private closeRequested = false;
  private pausedByLifecycle = false;
  private networkOffline = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly pending = new Map<number, PendingEntry>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatAckTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInFlight = false;
  private lifecycleBound = false;
  private readonly lifecycleUnsubscribers: Array<() => void> = [];
  private onlineWaiters: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout> | null;
  }> = [];
  /** serial 策略的并发闸门。 */
  private serialLocked = false;
  private readonly serialQueue: Array<() => void> = [];
  private pendingSeq = 0;

  /** 心跳观测（供 ConnectionStore 展示）。 */
  heartbeatAcks = 0;
  lastHeartbeatAckAt: number | null = null;
  lastHeartbeatErrorCode: number | undefined;
  latencyMs: number | null = null;
  serverTimeOffsetMs: number | null = null;

  constructor(options: IonetClientOptions) {
    if (!options.url) throw new Error('IonetClient: url 不能为空');
    this.url = options.url;
    this.adapterFactory =
      options.adapterFactory ?? (() => new BrowserSocketAdapter());
    this.correlation = new Correlation(
      options.correlation ?? 'reqId',
      options.reqIdGenerator ?? defaultReqIdGenerator(),
    );
    this.heartbeat =
      options.heartbeat === false ? false : { ...DEFAULT_HEARTBEAT, ...(options.heartbeat ?? {}) };
    this.reconnectOpts = { ...DEFAULT_RECONNECT, ...(options.reconnect ?? {}) };
    this.authHandler = options.authHandler;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.lifecycle =
      options.lifecycle ??
      (typeof document === 'undefined' ? new NoopLifecycleAdapter() : new BrowserLifecycleAdapter());
    this.lifecycleAware = options.lifecycleAware ?? true;
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? (() => Math.random());
    this.logger = options.logger ?? (() => undefined);
    this.onStateChangeCb = options.onStateChange;
    this.onNotificationCb = options.onNotification;
    this.onBusinessErrorCb = options.onBusinessError;
    this.onHandshakeRejectedCb = options.onHandshakeRejected;
    this.onServerTimeCb = options.onServerTime;
  }

  // ===== 只读观测 =====

  getState(): ConnectionState {
    return this.state;
  }

  getStateDetail(): string | undefined {
    return this.stateDetail;
  }

  get isOnline(): boolean {
    return this.state === 'online';
  }

  /** 在途请求数（并发探针）。 */
  get inFlight(): number {
    return this.pending.size;
  }

  /** 当前关联策略。 */
  get correlationStrategy(): CorrelationStrategy {
    return this.correlation.strategy;
  }

  // ===== 连接生命周期 =====

  /** 建立连接；resolve = 握手成功（online）；reject = 握手被拒/网络失败。幂等。 */
  connect(): Promise<void> {
    if (this.state === 'online') return Promise.resolve();
    if (this.connectPromise !== null) return this.connectPromise;
    this.closeRequested = false;
    this.pausedByLifecycle = false;
    const promise = new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
    });
    this.connectPromise = promise;
    this.bindLifecycle();
    void this.openSocket(false);
    return promise;
  }

  /** 主动关闭：停止心跳/重连/生命周期订阅，并让全部在途请求失败。 */
  close(detail = 'client-close'): void {
    this.closeRequested = true;
    this.pausedByLifecycle = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.unbindLifecycle();
    this.failAllPending(new ConnectionError(`连接已关闭（${detail}）`));
    this.rejectOnlineWaiters(new ConnectionError('连接已关闭'));
    const adapter = this.adapter;
    this.adapter = null;
    this.opened = false;
    if (adapter !== null) {
      try {
        adapter.close(1000, detail);
      } catch {
        /* 忽略 */
      }
    }
    this.settleConnect(new HandshakeError('client closed before open'));
    this.setState('closed', detail);
  }

  /**
   * 强制重连（心跳判死路径）：关闭当前 socket，交由 close 处理走退避重连。
   */
  forceReconnect(reason: string): void {
    this.log(`强制重连：${reason}`);
    const adapter = this.adapter;
    if (adapter !== null) {
      this.adapter = null;
      this.opened = false;
      try {
        adapter.close(4000, reason);
      } catch {
        /* 忽略 */
      }
    }
    this.stopHeartbeat();
    this.failAllPending(new ConnectionError(`连接重建：${reason}`));
    if (this.closeRequested) return;
    if (this.pausedByLifecycle) {
      this.setState('offline', reason);
      return;
    }
    if (!this.reconnectOpts.enabled) {
      this.setState('failed', reason);
      return;
    }
    this.scheduleReconnect(reason);
  }

  // ===== 请求 =====

  /**
   * 发一次请求，成功时返回 Action 业务体 `{ success, message, data }`（类型参数即 `data` 的形状）。
   * 失败：`TransportError` / `BusinessError` / `RequestTimeoutError` / `ConnectionError`。
   */
  async request<TData = unknown>(
    cmd: number,
    subCmd: number,
    data?: unknown,
    options: SendOptions = {},
  ): Promise<ActionResult<TData>> {
    const response = await this.requestEnvelope(cmd, subCmd, data, options);
    if (options.allowBusinessFailure !== true) {
      try {
        assertResponseOk(response);
      } catch (error) {
        if (error instanceof BusinessError) this.onBusinessErrorCb?.(error);
        throw error;
      }
    }
    return response.data as ActionResult<TData>;
  }

  /**
   * 发一次请求并返回**原始响应信封**（只做传输层 `errorCode` 判定；业务判定交给调用方）。
   */
  async requestEnvelope(
    cmd: number,
    subCmd: number,
    data?: unknown,
    options: SendOptions = {},
  ): Promise<ResponseMessage> {
    if (this.correlation.strategy === 'serial') {
      await this.acquireSerial();
    }
    try {
      const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
      await this.waitForOnline(timeoutMs);
      return await this.dispatch(cmd, subCmd, data, options, timeoutMs);
    } finally {
      if (this.correlation.strategy === 'serial') this.releaseSerial();
    }
  }

  private dispatch(
    cmd: number,
    subCmd: number,
    data: unknown,
    options: SendOptions,
    timeoutMs: number,
  ): Promise<ResponseMessage> {
    return new Promise<ResponseMessage>((resolve, reject) => {
      const adapter = this.adapter;
      if (adapter === null || this.state !== 'online') {
        reject(new ConnectionError('连接未就绪'));
        return;
      }
      const { reqId, pending } = this.correlation.begin();
      const startedAt = this.now();
      const entry: PendingEntry = {
        seq: pending.seq,
        cmd,
        subCmd,
        startedAt,
        resolve,
        reject,
        timer: null,
      };
      entry.timer = setTimeout(() => {
        this.pending.delete(pending.seq);
        reject(new RequestTimeoutError(`请求超时（cmd=${cmd}, subCmd=${subCmd}）`, cmd, subCmd));
      }, timeoutMs);
      this.pending.set(pending.seq, entry);

      const message: Record<string, unknown> = { cmd, subCmd, data };
      if (options.headers !== undefined) message['headers'] = options.headers;
      if (options.traceId !== undefined) message['traceId'] = options.traceId;
      if (reqId !== undefined) message['reqId'] = reqId;

      try {
        adapter.send(envelopeCodec.encode(message));
      } catch (error) {
        this.pending.delete(pending.seq);
        if (entry.timer !== null) clearTimeout(entry.timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  // ===== 内部：连接 =====

  private async openSocket(isReconnect: boolean): Promise<void> {
    if (this.closeRequested) return;
    if (this.pausedByLifecycle) {
      this.setState('offline', '生命周期暂停');
      this.settleConnect(new HandshakeError('lifecycle paused'));
      return;
    }
    this.setState(isReconnect ? 'connecting' : 'connecting', isReconnect ? '重连中' : '首次连接');
    this.opened = false;

    let token: string | undefined;
    try {
      token = await this.authHandler?.();
    } catch (error) {
      this.log('authHandler 抛错', error);
      token = undefined;
    }
    if (this.closeRequested) return;

    let adapter: SocketAdapter;
    try {
      adapter = this.adapterFactory();
    } catch (error) {
      this.handleConnectFailure(
        new HandshakeError(`适配器创建失败：${(error as Error).message}`),
        isReconnect,
      );
      return;
    }
    this.adapter = adapter;
    const handshakeUrl = withToken(this.url, token);
    const hasToken = typeof token === 'string' && token.length > 0;

    adapter.onOpen(() => {
      if (this.adapter !== adapter) return;
      this.opened = true;
      this.reconnectAttempts = 0;
      this.setState('online', 'handshake ok');
      this.settleConnect(null);
      this.startHeartbeat();
      this.resolveOnlineWaiters();
    });

    adapter.onMessage((frame) => {
      if (this.adapter !== adapter) return;
      this.handleFrame(frame);
    });

    adapter.onError((error) => {
      if (this.adapter !== adapter) return;
      this.log('socket error', error.message);
    });

    adapter.onClose((event) => {
      if (this.adapter !== adapter) return;
      this.adapter = null;
      this.stopHeartbeat();
      const wasOpen = this.opened;
      this.opened = false;

      if (this.closeRequested) {
        this.setState('closed', 'client-close');
        return;
      }
      const failure = new HandshakeError(
        wasOpen
          ? `连接断开（closeCode=${event.code}）`
          : this.handshakeFailureMessage(event, hasToken),
        event.code,
        event.reason,
      );
      this.failAllPending(
        wasOpen ? new ConnectionError(failure.message) : failure,
      );

      if (!wasOpen) {
        // 握手阶段失败：401 拒升级在浏览器表现为未 open 即 close。
        this.onHandshakeRejectedCb?.(failure);
        if (this.pausedByLifecycle) {
          this.setState('offline', failure.message);
          this.settleConnect(failure);
          return;
        }
        if (this.reconnectOpts.enabled && this.reconnectOpts.reconnectOnHandshakeFailure) {
          this.settleConnect(failure);
          this.scheduleReconnect(failure.message);
          return;
        }
        this.setState('failed', failure.message);
        this.rejectOnlineWaiters(failure);
        this.settleConnect(failure);
        return;
      }

      if (this.pausedByLifecycle) {
        this.setState('offline', '生命周期暂停');
        return;
      }
      if (this.reconnectOpts.enabled) {
        this.scheduleReconnect(failure.message);
      } else {
        this.setState('failed', failure.message);
        this.rejectOnlineWaiters(new ConnectionError(failure.message));
      }
    });

    try {
      adapter.connect(handshakeUrl);
    } catch (error) {
      this.adapter = null;
      this.handleConnectFailure(
        new HandshakeError(`无法建立 WebSocket：${(error as Error).message}`),
        isReconnect,
      );
    }
  }

  private handshakeFailureMessage(event: SocketCloseEvent, hasToken: boolean): string {
    if (!hasToken) {
      return `握手被拒或连接失败（closeCode=${event.code}）；未提供 token —— 服务端会以 HTTP 401 拒绝无凭据的握手（PROTOCOL.md §6）`;
    }
    return `握手被拒或连接失败（closeCode=${event.code}）；token 可能无效或已过期（PROTOCOL.md §6）`;
  }

  private handleConnectFailure(error: Error, isReconnect: boolean): void {
    this.failAllPending(error);
    if (this.closeRequested) return;
    const handshake = error instanceof HandshakeError ? error : new HandshakeError(error.message);
    if (this.reconnectOpts.enabled && (isReconnect || this.reconnectOpts.reconnectOnHandshakeFailure)) {
      this.settleConnect(handshake);
      this.scheduleReconnect(handshake.message);
      return;
    }
    this.setState('failed', handshake.message);
    this.rejectOnlineWaiters(handshake);
    this.settleConnect(handshake);
  }

  private scheduleReconnect(reason: string): void {
    this.clearReconnectTimer();
    this.reconnectAttempts += 1;
    const { maxAttempts } = this.reconnectOpts;
    if (maxAttempts !== 'infinite' && this.reconnectAttempts > maxAttempts) {
      this.setState('failed', `重连尝试已达上限（${maxAttempts}）：${reason}`);
      this.rejectOnlineWaiters(new ConnectionError('重连尝试已达上限'));
      return;
    }
    const delay = this.computeBackoffDelay(this.reconnectAttempts);
    this.setState('reconnecting', `第 ${this.reconnectAttempts} 次重连，${delay}ms 后（${reason}）`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket(true);
    }, delay);
  }

  /** 指数退避 + 抖动：base * 2^(attempt-1)，封顶 max，再乘以 1±jitterRatio。 */
  private computeBackoffDelay(attempt: number): number {
    const { baseDelayMs, maxDelayMs, jitterRatio } = this.reconnectOpts;
    const raw = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    const jitter = 1 + (this.random() * 2 - 1) * jitterRatio;
    return Math.max(0, Math.round(raw * jitter));
  }

  // ===== 内部：帧处理 =====

  private handleFrame(frame: string | ArrayBuffer): void {
    let classified: { kind: string; frame: WireFrame };
    try {
      classified = envelopeCodec.decodeClassified(frameToText(frame));
    } catch (error) {
      this.log('坏帧（PROTOCOL.md §8 客户端侧）', (error as Error).message);
      return;
    }
    const kind = classifyFrame(classified.frame);
    if (kind === 'notification') {
      this.onNotificationCb?.(classified.frame as NotificationMessage);
      return;
    }
    if (kind === 'request') {
      // 服务端不会向客户端发请求帧；出现即协议异常，不静默误配。
      this.log('收到意外的 request 帧，已忽略', classified.frame);
      return;
    }
    if (kind === 'unknown') {
      this.log('协议外 kind，已忽略', classified.frame);
      return;
    }
    this.settleResponse(classified.frame as ResponseMessage);
  }

  private settleResponse(response: ResponseMessage): void {
    const associated = this.correlation.associate(response as unknown as WireFrame);
    if (!associated.ok) {
      this.log('响应无匹配在途请求', associated.reason, response);
      return;
    }
    const entry = this.pending.get(associated.pending.seq);
    if (entry === undefined) {
      this.log('在途条目缺失（已超时？）', associated.pending.seq);
      return;
    }
    this.pending.delete(entry.seq);
    if (entry.timer !== null) clearTimeout(entry.timer);
    const rtt = this.now() - entry.startedAt;
    this.latencyMs = rtt;
    if (entry.cmd === this.heartbeatRoute().cmd && entry.subCmd === this.heartbeatRoute().subCmd) {
      this.markHeartbeatAck(response);
    }
    this.captureServerTime(response, rtt);
    entry.resolve(response);
  }

  private failAllPending(error: Error): void {
    const drained = this.correlation.drain();
    for (const pending of drained) {
      const entry = this.pending.get(pending.seq);
      if (entry === undefined) continue;
      this.pending.delete(entry.seq);
      if (entry.timer !== null) clearTimeout(entry.timer);
      entry.reject(error);
    }
    // 兜底：关联器与 pending 理论上同步，仍清一遍防漏。
    for (const [seq, entry] of this.pending) {
      if (entry.timer !== null) clearTimeout(entry.timer);
      this.pending.delete(seq);
      entry.reject(error);
    }
  }

  // ===== 内部：心跳 =====

  private heartbeatRoute(): { cmd: number; subCmd: number } {
    if (this.heartbeat === false) return { cmd: -1, subCmd: -1 };
    return { cmd: this.heartbeat.cmd, subCmd: this.heartbeat.subCmd };
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (this.heartbeat === false) return;
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeatTick();
    }, this.heartbeat.intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatAckTimer !== null) {
      clearTimeout(this.heartbeatAckTimer);
      this.heartbeatAckTimer = null;
    }
    this.heartbeatInFlight = false;
  }

  private async heartbeatTick(): Promise<void> {
    if (this.heartbeat === false || this.state !== 'online') return;
    if (this.heartbeatInFlight) return; // 超时判死由 ackTimer 负责
    this.heartbeatInFlight = true;
    const { cmd, subCmd, timeoutMs } = this.heartbeat;
    this.heartbeatAckTimer = setTimeout(() => {
      this.heartbeatAckTimer = null;
      if (!this.heartbeatInFlight) return;
      this.heartbeatInFlight = false;
      this.lastHeartbeatErrorCode = undefined;
      this.forceReconnect(`心跳超时（>${timeoutMs}ms 未收 system.ping 响应）`);
    }, timeoutMs);
    try {
      const response = await this.requestEnvelope(cmd, subCmd, {}, { timeoutMs, allowBusinessFailure: true });
      // settleResponse 已处理 ack；此处仅记录传输层错误码（若有）。
      this.lastHeartbeatErrorCode = response.errorCode;
    } catch (error) {
      this.log('心跳请求失败', (error as Error).message);
    }
  }

  private markHeartbeatAck(response: ResponseMessage): void {
    this.heartbeatInFlight = false;
    if (this.heartbeatAckTimer !== null) {
      clearTimeout(this.heartbeatAckTimer);
      this.heartbeatAckTimer = null;
    }
    this.heartbeatAcks += 1;
    this.lastHeartbeatAckAt = this.now();
    this.lastHeartbeatErrorCode = response.errorCode;
  }

  // ===== 内部：serverTime =====

  private captureServerTime(response: ResponseMessage, rtt: number): void {
    const serverTimeMs = extractServerTime(response.data);
    if (serverTimeMs === undefined) return;
    const offsetMs = serverTimeMs - (this.now() - rtt / 2);
    this.serverTimeOffsetMs = offsetMs;
    this.onServerTimeCb?.({ serverTimeMs, offsetMs, rttMs: rtt });
  }

  // ===== 内部：在线等待 =====

  private waitForOnline(timeoutMs: number): Promise<void> {
    if (this.state === 'online') return Promise.resolve();
    if (this.state === 'idle' || this.state === 'closed' || this.state === 'failed') {
      return Promise.reject(new ConnectionError(`连接不可用（state=${this.state}）`));
    }
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: null as ReturnType<typeof setTimeout> | null,
      };
      waiter.timer = setTimeout(() => {
        this.onlineWaiters = this.onlineWaiters.filter((w) => w !== waiter);
        reject(new ConnectionError(`等待连接就绪超时（state=${this.state}）`));
      }, timeoutMs);
      this.onlineWaiters.push(waiter);
    });
  }

  private resolveOnlineWaiters(): void {
    const waiters = this.onlineWaiters;
    this.onlineWaiters = [];
    for (const waiter of waiters) {
      if (waiter.timer !== null) clearTimeout(waiter.timer);
      waiter.resolve();
    }
  }

  private rejectOnlineWaiters(error: Error): void {
    const waiters = this.onlineWaiters;
    this.onlineWaiters = [];
    for (const waiter of waiters) {
      if (waiter.timer !== null) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  // ===== 内部：serial 闸门 =====

  private acquireSerial(): Promise<void> {
    if (!this.serialLocked) {
      this.serialLocked = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.serialQueue.push(resolve);
    });
  }

  private releaseSerial(): void {
    const next = this.serialQueue.shift();
    if (next !== undefined) {
      next();
      return;
    }
    this.serialLocked = false;
  }

  // ===== 内部：状态机 =====

  private setState(state: ConnectionState, detail?: string): void {
    if (this.state === state && this.stateDetail === detail) return;
    this.state = state;
    this.stateDetail = detail;
    this.onStateChangeCb?.(state, detail);
  }

  private settleConnect(error: Error | null): void {
    if (error === null) {
      this.resolveConnect?.();
    } else {
      this.rejectConnect?.(error);
    }
    this.resolveConnect = null;
    this.rejectConnect = null;
    this.connectPromise = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ===== 内部：生命周期 =====

  private bindLifecycle(): void {
    if (!this.lifecycleAware || this.lifecycleBound) return;
    this.lifecycleBound = true;
    this.lifecycleUnsubscribers.push(
      this.lifecycle.onVisibilityChange(() => this.evaluateLifecycle()),
      this.lifecycle.onOnline(() => {
        this.networkOffline = false;
        this.evaluateLifecycle();
      }),
      this.lifecycle.onOffline(() => {
        this.networkOffline = true;
        this.evaluateLifecycle();
      }),
    );
  }

  private unbindLifecycle(): void {
    for (const unsubscribe of this.lifecycleUnsubscribers.splice(0)) unsubscribe();
    this.lifecycleBound = false;
  }

  private lifecyclePaused(): boolean {
    if (!this.lifecycleAware) return false;
    if (this.networkOffline) return true;
    return this.reconnectOpts.respectLifecycle && this.lifecycle.isHidden();
  }

  private evaluateLifecycle(): void {
    if (this.closeRequested) return;
    if (this.lifecyclePaused()) {
      if (this.state === 'online' || this.state === 'connecting' || this.state === 'reconnecting') {
        this.pauseForLifecycle();
      }
      return;
    }
    if (this.state === 'offline') {
      this.pausedByLifecycle = false;
      this.log('生命周期恢复，重新连接');
      void this.openSocket(true);
    }
  }

  private pauseForLifecycle(): void {
    this.pausedByLifecycle = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    const adapter = this.adapter;
    this.adapter = null;
    this.opened = false;
    this.failAllPending(new ConnectionError('生命周期暂停（后台/离线）'));
    this.setState('offline', '生命周期暂停（后台/离线）');
    if (adapter !== null) {
      try {
        adapter.close(1000, 'lifecycle-pause');
      } catch {
        /* 忽略 */
      }
    }
  }

  private log(...args: unknown[]): void {
    this.logger(...args);
  }
}

/** 从 Action 结果体里尽力提取服务端时间（Q6 未定，兼容 `data.serverTime` / `data.data.serverTime`）。 */
export function extractServerTime(body: unknown): number | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const candidates: unknown[] = [
    (body as { serverTime?: unknown }).serverTime,
    (body as { serverTimeMs?: unknown }).serverTimeMs,
    (body as { data?: { serverTime?: unknown } }).data?.serverTime,
    (body as { data?: { serverTimeMs?: unknown } }).data?.serverTimeMs,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/** 显式引用 ProtocolError，保证类型从本模块可达（供上层 instanceof 判定）。 */
export { ProtocolError };
