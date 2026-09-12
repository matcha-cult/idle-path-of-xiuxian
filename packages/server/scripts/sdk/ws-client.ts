/**
 * 放置·修仙之路 WS 参考客户端（前端 SDK 原型）
 *
 * 契约对齐 ai-docs/ws-protocol-contract.md：
 * - 请求 { cmd, subCmd, data }，受保护 Action 在 data.__token 带 JWT
 * - 响应 { data?, errorCode?, errorMessage? }，无 requestId / 无 cmd 回显
 * - 因而必须「串行队列」：同一时刻只允许一个在途请求
 * - 应用层心跳：定时发 (1,1) system.ping
 * - 断线后自动重连，并在每次请求时重新取 token（getToken），故重连后可继续
 *
 * 依赖注入式的 WebSocketImpl 让同一份代码可用于浏览器（globalThis.WebSocket）
 * 或 Node（ws 包）。
 */

export interface WarWsClientOptions {
  url: string;
  /** 每次请求时取 token（重连后自然拿到最新 token） */
  getToken?: () => string | undefined | Promise<string | undefined>;
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

const OPEN = 1;

export class WarWsClient {
  private readonly opts: Required<Pick<WarWsClientOptions, 'url' | 'heartbeatMs' | 'requestTimeoutMs' | 'reconnectBaseDelayMs' | 'reconnectMaxDelayMs'>> & WarWsClientOptions;
  private ws: WsLike | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private pending: { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
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
  }

  get connected(): boolean {
    return this.ws != null && this.ws.readyState === OPEN;
  }

  /** 建立连接（幂等） */
  async connect(): Promise<void> {
    if (this.connected) return;
    this.closedByUser = false;
    const Impl = (this.opts.WebSocketImpl ?? (globalThis as { WebSocket?: unknown }).WebSocket) as
      | (new (url: string) => WsLike)
      | undefined;
    if (!Impl) throw new Error('未提供 WebSocketImpl，且运行环境无 globalThis.WebSocket');

    await new Promise<void>((resolve, reject) => {
      const ws = new Impl(this.opts.url);
      let opened = false;
      const bind = (type: string, handler: (ev: any) => void) => {
        if (typeof ws.addEventListener === 'function') ws.addEventListener(type, handler);
        else ws.on?.(type, handler);
      };
      bind('open', () => {
        opened = true;
        this.ws = ws;
        this.reconnectAttempts = 0;
        this.opts.onLog?.('open');
        this.startHeartbeat();
        resolve();
      });
      bind('message', (ev: any) => this.onMessage(ev?.data ?? ev));
      bind('close', () => {
        if (this.ws === ws) this.ws = null;
        this.failPending(new Error('连接已断开'));
        if (!opened) reject(new Error('连接失败'));
        this.scheduleReconnect();
      });
      bind('error', (err: any) => {
        if (!opened) reject(err instanceof Error ? err : new Error('连接错误'));
      });
    });
  }

  /** 串行调用：一次只发一个请求，收到响应再发下一个 */
  call(cmd: number, subCmd: number, data: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const run = () => this.send(cmd, subCmd, data);
    const result = this.chain.then(run, run);
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
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
    this.ws?.close();
    this.ws = null;
  }

  private async send(cmd: number, subCmd: number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.connect();
    const token = await this.opts.getToken?.();
    const payload = token ? { ...data, __token: token } : data;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      if (this.pending) {
        reject(new Error('存在在途请求：客户端必须串行调用'));
        return;
      }
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error(`请求超时 cmd=${cmd} subCmd=${subCmd}`));
      }, this.opts.requestTimeoutMs);
      this.pending = { resolve, reject, timer };
      const enriched = { cmd, subCmd, data: payload };
      this.opts.onLog?.('send', enriched);
      this.ws!.send(JSON.stringify(enriched));
    });
  }

  private onMessage(raw: unknown): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : String(raw)) as Record<string, unknown>;
    } catch {
      this.opts.onLog?.('invalid-message', raw);
      return;
    }
    if (this.pending) {
      clearTimeout(this.pending.timer);
      const pending = this.pending;
      this.pending = null;
      this.opts.onLog?.('recv', message);
      pending.resolve(message);
      return;
    }
    this.opts.onNotification?.(message);
  }

  private failPending(error: Error): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    const pending = this.pending;
    this.pending = null;
    pending.reject(error);
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
