/**
 * 放置·修仙之路 WS 参考客户端（前端 SDK 原型）
 *
 * 契约对齐 ai-docs/ws-protocol-contract.md 与框架 d9a3beb：
 * - 请求 { cmd, subCmd, data, reqId? }；受保护 Action 默认在 data.__token 带 JWT
 *   （启用握手鉴权时改为 `getAuthHeaders`，见任务 3）
 * - 响应 { data?, errorCode?, errorMessage?, reqId?, kind? }
 * - **按 reqId 配对**：支持并发在途请求（不再需要串行队列）
 *   · 响应带 reqId → 精确配对；
 *   · 响应不带 reqId（旧服务）→ 回退为「配对最早的在途请求」，保持兼容；
 *   · kind === 'notification' → 视为服务端推送，走 onNotification。
 * - 应用层心跳：定时发 (1,1) system.ping
 * - 断线后自动重连；每次请求重新取 token，重连后可继续
 *
 * 依赖注入式的 WebSocketImpl 让同一份代码可用于浏览器（globalThis.WebSocket）
 * 或 Node（ws 包；握手鉴权经第二个参数传 headers）。
 */

export interface WarWsClientOptions {
  url: string;
  /** 每次请求时取 token（重连后自然拿到最新 token） */
  getToken?: () => string | undefined | Promise<string | undefined>;
  /** 握手阶段附加的请求头（Node ws 支持；浏览器不可用，改用 URL token） */
  getAuthHeaders?: () => Record<string, string> | undefined | Promise<Record<string, string> | undefined>;
  /** WebSocket 实现；默认用 globalThis.WebSocket */
  WebSocketImpl?: unknown;
  /** 应用层心跳间隔（ms），0 关闭 */
  heartbeatMs?: number;
  /** 单请求超时（ms） */
  requestTimeoutMs?: number;
  /** 重连基线/上限延迟（ms） */
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  onNotification?: (message: Record<string, unknown>) => void;
  onLog?: (event: string, detail?: unknown) => void;
}

type WsLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener?(type: string, handler: (ev: any) => void): void;
  on?(type: string, handler: (ev: any) => void): void;
};

interface PendingRequest {
  reqId: string;
  cmd: number;
  subCmd: number;
  resolve: (v: Record<string, unknown>) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const OPEN = 1;

let clientSeq = 0;

export class WarWsClient {
  private readonly opts: Required<Pick<WarWsClientOptions, 'url' | 'heartbeatMs' | 'requestTimeoutMs' | 'reconnectBaseDelayMs' | 'reconnectMaxDelayMs'>> & WarWsClientOptions;
  private readonly idPrefix: string;
  private ws: WsLike | null = null;
  /** 在途请求：reqId -> pending */
  private readonly pending = new Map<string, PendingRequest>();
  /** 在途请求的到达顺序（旧服务无 reqId 回显时的回退配对依据） */
  private readonly pendingOrder: string[] = [];
  private reqSeq = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private closedByUser = false;
  private reconnectAttempts = 0;

  constructor(options: WarWsClientOptions) {
    this.opts = {
      heartbeatMs: 20000,
      requestTimeoutMs: 10000,
      reconnectBaseDelayMs: 500,
      reconnectMaxDelayMs: 5000,
      ...options,
    };
    clientSeq += 1;
    this.idPrefix = `c${clientSeq}-${Math.random().toString(36).slice(2, 8)}`;
  }

  get connected(): boolean {
    return this.ws != null && this.ws.readyState === OPEN;
  }

  /** 当前在途请求数（并发探针） */
  get inFlight(): number {
    return this.pending.size;
  }

  /** 建立连接（幂等） */
  async connect(): Promise<void> {
    if (this.connected) return;
    this.closedByUser = false;
    const Impl = (this.opts.WebSocketImpl ?? (globalThis as { WebSocket?: unknown }).WebSocket) as
      | (new (url: string, options?: { headers?: Record<string, string> }) => WsLike)
      | undefined;
    if (!Impl) throw new Error('未提供 WebSocketImpl，且运行环境无 globalThis.WebSocket');

    const headers = await this.opts.getAuthHeaders?.();

    await new Promise<void>((resolve, reject) => {
      const ws = headers ? new Impl(this.opts.url, { headers }) : new Impl(this.opts.url);
      let opened = false;
      const bind = (type: string, handler: (ev: any) => void) => {
        if (typeof ws.addEventListener === 'function') ws.addEventListener(type, handler);
        else ws.on?.(type, handler);
      };
      bind('open', () => {
        opened = true;
        this.ws = ws;
        this.reconnectAttempts = 0;
        this.opts.onLog?.('open', headers ? { authed: true } : undefined);
        this.startHeartbeat();
        resolve();
      });
      bind('message', (ev: any) => this.onMessage(ev?.data ?? ev));
      bind('close', () => {
        if (this.ws === ws) this.ws = null;
        this.failAllPending(new Error('连接已断开'));
        if (!opened) reject(new Error('连接失败'));
        this.scheduleReconnect();
      });
      bind('error', (err: any) => {
        if (!opened) reject(err instanceof Error ? err : new Error('连接错误'));
      });
    });
  }

  /**
   * 发起请求。支持并发：多个在途请求各自按 reqId 配对。
   * @param reqId 可显式指定（默认自动生成）
   */
  async call(
    cmd: number,
    subCmd: number,
    data: Record<string, unknown> = {},
    reqId?: string,
  ): Promise<Record<string, unknown>> {
    await this.connect();
    const token = await this.opts.getToken?.();
    const payload = token ? { ...data, __token: token } : data;
    const id = reqId ?? `${this.idPrefix}-${++this.reqSeq}`;

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const idx = this.pendingOrder.indexOf(id);
        if (idx >= 0) this.pendingOrder.splice(idx, 1);
        reject(new Error(`请求超时 cmd=${cmd} subCmd=${subCmd} reqId=${id}`));
      }, this.opts.requestTimeoutMs);

      this.pending.set(id, { reqId: id, cmd, subCmd, resolve, reject, timer });
      this.pendingOrder.push(id);

      const envelope = { cmd, subCmd, data: payload, reqId: id };
      this.opts.onLog?.('send', envelope);
      this.ws!.send(JSON.stringify(envelope));
    });
  }

  /** 模拟网络掉线（用于验收重连） */
  simulateDrop(): void {
    this.ws?.close();
    this.ws = null;
  }

  /** 主动关闭（不再自动重连） */
  close(): void {
    this.closedByUser = true;
    this.stopHeartbeat();
    this.failAllPending(new Error('客户端已关闭'));
    this.ws?.close();
    this.ws = null;
  }

  private onMessage(raw: unknown): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : String(raw)) as Record<string, unknown>;
    } catch {
      this.opts.onLog?.('invalid-message', raw);
      return;
    }
    this.opts.onLog?.('recv', message);

    // 服务端主动推送：显式判别，不占用任何在途请求
    if (message.kind === 'notification') {
      this.opts.onNotification?.(message);
      return;
    }

    const reqId = message.reqId;
    if (typeof reqId === 'string' && this.settle(reqId, message)) return;

    // 旧服务无 reqId 回显：按最早在途请求配对（保持串行语义下的兼容）
    const oldest = this.pendingOrder[0];
    if (oldest !== undefined && this.settle(oldest, message)) return;

    this.opts.onNotification?.(message);
  }

  /** 结算指定 reqId 的在途请求；不存在返回 false */
  private settle(reqId: string, message: Record<string, unknown>): boolean {
    const pending = this.pending.get(reqId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(reqId);
    const idx = this.pendingOrder.indexOf(reqId);
    if (idx >= 0) this.pendingOrder.splice(idx, 1);
    pending.resolve(message);
    return true;
  }

  private failAllPending(error: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.pendingOrder.length = 0;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (!this.opts.heartbeatMs) return;
    this.heartbeatTimer = setInterval(() => {
      if (!this.connected) return;
      this.call(1, 1, {}).catch(() => undefined);
    }, this.opts.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.closedByUser || this.connected) return;
    const delay = Math.min(
      this.opts.reconnectBaseDelayMs * 2 ** this.reconnectAttempts,
      this.opts.reconnectMaxDelayMs,
    );
    this.reconnectAttempts += 1;
    setTimeout(() => {
      if (this.closedByUser || this.connected) return;
      this.connect().catch(() => this.scheduleReconnect());
    }, delay).unref?.();
  }
}
