/**
 * FakeSocketAdapter —— 零后端也能开发/测试（02 §3.7）。
 *
 * 脚本化能力：
 * - `autoOpen`（默认 true）在下一个微任务 open；
 * - `closeOnConnect` 模拟握手被拒（浏览器读不到 401，只看到未 open 即 close，PROTOCOL.md §6）；
 * - `emitMessage(frame)` 注入服务端帧（响应或推送）；
 * - `serverClose(code)` 模拟断线；
 * - `onSend` 钩子供 `MemoryIonetServer` 自动应答。
 *
 * 本文件属于 `/testing` 子路径，**不进生产产物依赖**，但为了单包构建简单仍放在 `src/` 下。
 */
import type {
  SocketAdapter,
  SocketCloseEvent,
  SocketReadyState,
  Unsubscribe,
} from '../transport/socket-adapter.js';

export interface FakeSocketOptions {
  /** 是否在 connect 后自动 open（默认 true）。 */
  autoOpen?: boolean;
  /** 模拟握手被拒：未 open 即以该 close code 关闭。 */
  closeOnConnect?: { code: number; reason: string };
  /** 模拟构造/连接错误。 */
  failOnConnect?: Error;
  /** 发送帧钩子（供 mock server 应答）。 */
  onSend?: (data: string | Uint8Array) => void;
}

export class FakeSocketAdapter implements SocketAdapter {
  readyState: SocketReadyState = 'closed';
  url: string | null = null;
  readonly sent: string[] = [];
  readonly closeCalls: Array<{ code?: number; reason?: string }> = [];
  connectCalls = 0;

  private readonly options: FakeSocketOptions;
  private readonly openHandlers = new Set<() => void>();
  private readonly messageHandlers = new Set<(frame: string | ArrayBuffer) => void>();
  private readonly closeHandlers = new Set<(event: SocketCloseEvent) => void>();
  private readonly errorHandlers = new Set<(error: Error) => void>();
  private readonly sendHandlers = new Set<(data: string | Uint8Array) => void>();

  constructor(options: FakeSocketOptions = {}) {
    this.options = options;
  }

  connect(url: string): void {
    if (this.readyState !== 'closed') throw new Error('FakeSocketAdapter: already connected');
    this.connectCalls += 1;
    this.url = url;
    this.readyState = 'connecting';
    if (this.options.failOnConnect !== undefined) {
      const error = this.options.failOnConnect;
      queueMicrotask(() => this.emitError(error));
      return;
    }
    if (this.options.closeOnConnect !== undefined) {
      const { code, reason } = this.options.closeOnConnect;
      queueMicrotask(() => this.serverClose(code, reason));
      return;
    }
    if (this.options.autoOpen !== false) {
      queueMicrotask(() => this.open());
    }
  }

  send(data: string | Uint8Array): void {
    if (this.readyState !== 'open') {
      throw new Error('FakeSocketAdapter: socket 未 open，拒绝发送');
    }
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    this.sent.push(text);
    this.options.onSend?.(data);
    for (const handler of this.sendHandlers) handler(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.emitClose({ code: code ?? 1000, reason: reason ?? '', wasClean: true });
  }

  onOpen(handler: () => void): Unsubscribe {
    this.openHandlers.add(handler);
    return () => this.openHandlers.delete(handler);
  }

  onMessage(handler: (frame: string | ArrayBuffer) => void): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onClose(handler: (event: SocketCloseEvent) => void): Unsubscribe {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /** 发送钩子（供 mock server 自动应答）。 */
  onSend(handler: (data: string | Uint8Array) => void): Unsubscribe {
    this.sendHandlers.add(handler);
    return () => this.sendHandlers.delete(handler);
  }

  // ===== 测试驱动面 =====

  open(): void {
    if (this.readyState !== 'connecting') return;
    this.readyState = 'open';
    for (const handler of this.openHandlers) handler();
  }

  /** 注入服务端帧（对象会被 JSON 序列化，贴近真实线协议）。 */
  emitMessage(frame: string | object): void {
    if (this.readyState !== 'open') return;
    const text = typeof frame === 'string' ? frame : JSON.stringify(frame);
    for (const handler of this.messageHandlers) handler(text);
  }

  /** 注入坏帧（无法 JSON 解析）。 */
  emitRaw(text: string): void {
    if (this.readyState !== 'open') return;
    for (const handler of this.messageHandlers) handler(text);
  }

  /** 模拟服务端异常断开（1006）。 */
  serverClose(code = 1006, reason = ''): void {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.emitClose({ code, reason, wasClean: false });
  }

  emitError(error: Error = new Error('fake socket error')): void {
    for (const handler of this.errorHandlers) handler(error);
  }

  /** 已发送帧的 JSON 解析视图。 */
  sentFrames(): Array<Record<string, unknown>> {
    return this.sent.map((text) => JSON.parse(text) as Record<string, unknown>);
  }

  private emitClose(event: SocketCloseEvent): void {
    for (const handler of this.closeHandlers) handler(event);
  }
}
