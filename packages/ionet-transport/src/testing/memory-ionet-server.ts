/**
 * MemoryIonetServer —— 几十行复刻 PROTOCOL.md §3/§4/§5/§8 的 mock 服务端（02 §3.7）。
 *
 * 与 `FakeSocketAdapter` 配套：解析客户端帧 → 调用 `handler` → 按「请求是否携带 reqId」
 * 决定是否回显 `reqId` + 写入 `kind='response'`（§4/§12.1），推送一律 `kind='notification'`（§5）。
 */
import type { NotificationMessage, ResponseMessage } from '@nbb-ionet/client-protocol';
import type { FakeSocketAdapter } from './fake-socket-adapter.js';

export interface MockRequest {
  cmd: number;
  subCmd: number;
  data?: unknown;
  headers?: Record<string, string>;
  traceId?: string;
  reqId?: string | number;
}

export interface MockReply {
  data?: unknown;
  errorCode?: number;
  errorMessage?: string;
  /** 延迟多少毫秒后回包（用于制造乱序响应）。 */
  delayMs?: number;
}

export type MockHandler = (request: MockRequest) => MockReply | null | Promise<MockReply | null>;

export interface MemoryIonetServerOptions {
  handler: MockHandler;
  /** 是否按 §4 回显 reqId/kind（默认 true；置 false 模拟旧服务）。 */
  echoReqId?: boolean;
}

/** 业务成功体（action-support.ts 形状）。 */
export function businessOk<T>(data: T, message = 'ok'): { success: true; message: string; data: T } {
  return { success: true, message, data };
}

/** 业务失败体：`errorCode` 仍为 0，业务码在 `data.data.code`（06 §2）。 */
export function businessFail(
  code: string,
  message = '业务失败',
): { success: false; message: string; data: { code: string } } {
  return { success: false, message, data: { code } };
}

export class MemoryIonetServer {
  readonly requests: MockRequest[] = [];
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly adapter: FakeSocketAdapter,
    private readonly options: MemoryIonetServerOptions,
  ) {}

  start(): void {
    this.unsubscribe?.();
    this.unsubscribe = this.adapter.onSend((data) => {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
      void this.handle(text);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** 注入一条服务端主动推送（§5，必带 kind='notification'）。 */
  push(notification: Omit<NotificationMessage, 'kind'> & { kind?: 'notification' }): void {
    this.adapter.emitMessage({ ...notification, kind: 'notification' });
  }

  /** 模拟服务端断线。 */
  drop(code = 1006, reason = 'server drop'): void {
    this.adapter.serverClose(code, reason);
  }

  private async handle(text: string): Promise<void> {
    let request: MockRequest;
    try {
      request = JSON.parse(text) as MockRequest;
    } catch {
      this.adapter.emitMessage({ errorCode: 400, errorMessage: 'bad frame' });
      return;
    }
    this.requests.push(request);
    const reply = await this.options.handler(request);
    if (reply === null) return;
    const response: ResponseMessage = {
      data: reply.data,
      ...(reply.errorCode !== undefined ? { errorCode: reply.errorCode } : {}),
      ...(reply.errorMessage !== undefined ? { errorMessage: reply.errorMessage } : {}),
    };
    if (this.options.echoReqId !== false && request.reqId !== undefined) {
      response.reqId = request.reqId;
      response.kind = 'response';
    }
    const send = (): void => this.adapter.emitMessage(response);
    if (reply.delayMs !== undefined && reply.delayMs > 0) {
      setTimeout(send, reply.delayMs);
    } else {
      send();
    }
  }
}
