/**
 * 错误模型（06 §2 的判定顺序 —— 这是本层最重要的契约之一）。
 *
 * 前端把一次请求的结果分三层判定：
 *
 * 1. **传输/框架层失败**：`errorCode !== 0`（且非 undefined）→ `TransportError`
 *    （400 坏帧 / 404 Action 未注册 / 500 内部异常，PROTOCOL.md §8）。
 * 2. **业务层失败**（本项目主路径）：`errorCode` 为 0/缺失，但 `data.success === false`，
 *    业务码在 `data.data.code` → `BusinessError`。**只判 errorCode 会把全部业务失败当成功。**
 * 3. 成功。
 *
 * 业务错误的形状来自 `packages/server/src/ionet/action-support.ts`：
 * `{ success: false, message: string, data: { code: string } }`。
 */
import type { ResponseMessage } from '@nbb-ionet/client-protocol';

/** Action 返回的业务结果信封（action-support.ts 的 `{ success, message, data? }`）。 */
export interface ActionResult<TData = unknown> {
  success: boolean;
  message?: string;
  data?: TData;
}

/** 业务失败体：`data.success === false` 且 `data.data.code` 为业务码。 */
export interface ActionFailBody {
  success: false;
  message?: string;
  data?: { code?: string };
}

/** 未知业务码占位：服务端未给出 `data.data.code` 时的兜底。 */
export const UNKNOWN_BUSINESS_CODE = 'UNKNOWN';

/** 传输/框架层失败（PROTOCOL.md §8）。 */
export class TransportError extends Error {
  override readonly name = 'TransportError';
  constructor(
    /** 服务端 errorCode（400/404/500…）。 */
    readonly errorCode: number,
    message?: string,
    readonly response?: ResponseMessage,
  ) {
    super(message ?? `传输层错误 errorCode=${errorCode}`);
  }
}

/** 业务层失败：`data.success === false`（06 §2）。 */
export class BusinessError extends Error {
  override readonly name = 'BusinessError';
  constructor(
    /** 业务码（`data.data.code`），缺失时为 `UNKNOWN`。 */
    readonly code: string,
    message?: string,
    readonly response?: ResponseMessage,
    /** 原始 Action 结果体，便于 UI 取更多上下文。 */
    readonly body?: unknown,
  ) {
    super(message ?? `业务失败 [${code}]`);
    // 服务端是否真的给了 message（`message` 已兜底，UI 需要区分「服务端文案」与「本地码表兜底」）
    this.serverMessage = message;
  }

  /** 服务端原始 message；缺失时为 undefined（UI 应回落到本地码表）。 */
  readonly serverMessage: string | undefined;
}

/** 帧无法解析 / 形状不符合协议（客户端侧 §8 语义）。 */
export class ProtocolError extends Error {
  override readonly name = 'ProtocolError';
}

/** 请求超时（未在 requestTimeoutMs 内拿到响应）。 */
export class RequestTimeoutError extends Error {
  override readonly name = 'RequestTimeoutError';
  constructor(
    message: string,
    readonly cmd?: number,
    readonly subCmd?: number,
  ) {
    super(message);
  }
}

/** 连接不可用（已关闭 / 重连中未就绪 / 队列超时）。 */
export class ConnectionError extends Error {
  override readonly name = 'ConnectionError';
}

/**
 * 握手被拒或连接失败。浏览器读不到 HTTP 状态码（PROTOCOL.md §6 的 401 在浏览器表现为
 * close code=1006 且未 open），因此这里给出可判定的错误类型 + 提示。
 */
export class HandshakeError extends Error {
  override readonly name = 'HandshakeError';
  constructor(
    message: string,
    readonly closeCode?: number,
    readonly closeReason?: string,
  ) {
    super(message);
  }
}

/** `data.success === false` 判定（严格：仅 false 视为业务失败，undefined/true 均为成功）。 */
export function isBusinessFailure(body: unknown): body is ActionFailBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { success?: unknown }).success === false
  );
}

/** 从 Action 结果体提取业务码（缺失 → `UNKNOWN`）。 */
export function businessCodeOf(body: unknown): string {
  const code = (body as { data?: { code?: unknown } } | null | undefined)?.data?.code;
  return typeof code === 'string' && code.length > 0 ? code : UNKNOWN_BUSINESS_CODE;
}

/** 从 Action 结果体提取业务文案。 */
export function businessMessageOf(body: unknown): string | undefined {
  const message = (body as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' && message.length > 0 ? message : undefined;
}

/**
 * 按 06 §2 的顺序判定一个响应信封，失败则抛出对应错误。
 * 成功时返回响应（不改写）。
 */
export function assertResponseOk(response: ResponseMessage): ResponseMessage {
  const { errorCode } = response;
  if (errorCode !== undefined && errorCode !== 0) {
    throw new TransportError(errorCode, response.errorMessage, response);
  }
  if (isBusinessFailure(response.data)) {
    throw new BusinessError(
      businessCodeOf(response.data),
      businessMessageOf(response.data),
      response,
      response.data,
    );
  }
  return response;
}
