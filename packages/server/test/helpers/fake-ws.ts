/**
 * 测试用 WebSocket：标准 EventTarget 风格，可手动触发 open/message/close/error。
 * 用于 ws-client（串行队列/超时/重连）的确定性测试，不联网。
 */
export type WsHandler = (ev: unknown) => void;

export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0; // CONNECTING
  readonly sent: string[] = [];
  closed = false;
  private readonly handlers = new Map<string, WsHandler[]>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }

  static get latest(): FakeWebSocket {
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    if (!ws) throw new Error('尚未创建 FakeWebSocket');
    return ws;
  }

  addEventListener(type: string, handler: WsHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3; // CLOSED
    this.emit('close', {});
  }

  // ===== 测试控制 =====
  emitOpen(): void {
    this.readyState = 1; // OPEN
    this.emit('open', {});
  }

  emitMessage(payload: unknown): void {
    this.emit('message', { data: typeof payload === 'string' ? payload : JSON.stringify(payload) });
  }

  emitError(error: Error): void {
    this.emit('error', error);
  }

  /** 解析最后一次发出的请求 */
  lastRequest(): { cmd: number; subCmd: number; data: Record<string, unknown> } {
    const raw = this.sent[this.sent.length - 1];
    if (raw == null) throw new Error('没有已发送的请求');
    return JSON.parse(raw) as { cmd: number; subCmd: number; data: Record<string, unknown> };
  }

  private emit(type: string, ev: unknown): void {
    for (const handler of this.handlers.get(type) ?? []) handler(ev);
  }
}
