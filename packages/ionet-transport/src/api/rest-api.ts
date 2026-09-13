/**
 * REST API 层（auth / character）—— 02 §4.2：REST 只负责认证 + 角色基础 + 健康检查。
 *
 * ⚠️ REST 信封与 WS **不同**（07 §0.4）：
 * - 成功：HTTP 200 + `{ success:true, message, data:{...} }`；
 * - 业务失败：**HTTP 200** + `{ success:false, message }`（**无 `data`，无业务码**）；
 * - 鉴权失败：HTTP 401 + NestJS 默认体。
 *
 * 因此这里对 `success === false` 统一抛 `BusinessError(UNKNOWN, message)`；
 * 401 抛 `RestError(401)`，供 `SessionStore` 触发登出。
 */
import { BusinessError, UNKNOWN_BUSINESS_CODE, type ActionResult } from '../client/errors.js';
import type { AuthData, CharacterData } from './dto.js';

/** REST 传输/协议层错误（HTTP 非 2xx）。 */
export class RestError extends Error {
  override readonly name = 'RestError';
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RestApiOptions {
  /** REST 前缀，默认 `/api`（同源，Vite 代理到后端）。 */
  baseUrl?: string;
  fetchImpl?: FetchLike;
  /** 取 JWT（受保护 endpoint 用）；返回 undefined 时不带 Authorization 头。 */
  tokenProvider?: () => string | undefined | Promise<string | undefined>;
}

/** 极小的 REST 客户端：POST/GET + 信封判定。 */
export class RestClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly tokenProvider: (() => string | undefined | Promise<string | undefined>) | undefined;

  constructor(options: RestApiOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '/api').replace(/\/$/, '');
    const impl = options.fetchImpl ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (impl === undefined) throw new Error('RestClient: 当前环境没有 fetch，请注入 fetchImpl');
    // ⚠️ 浏览器里 `fetch` 必须带 `this === window` 调用，否则抛
    // `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`。
    // 从 globalThis 取的 fetch 若直接存为字段再以 `this.fetchImpl(...)` 调用，receiver 会变成
    // RestClient 实例 —— 必须绑定回 globalThis（注入的 fetchImpl 为调用方责任，同样绑定无副作用）。
    this.fetchImpl = impl.bind(globalThis);
    this.tokenProvider = options.tokenProvider;
  }

  async request<TData>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<ActionResult<TData>> {
    const token = await this.tokenProvider?.();
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token !== undefined && token !== '') headers['Authorization'] = `Bearer ${token}`;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      throw new RestError(0, `网络错误：${(error as Error).message}`);
    }

    let payload: unknown;
    const text = await response.text();
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new RestError(response.status, `响应不是合法 JSON（HTTP ${response.status}）`, text);
      }
    }

    if (!response.ok) {
      const message =
        (payload as { message?: unknown } | undefined)?.message;
      throw new RestError(
        response.status,
        typeof message === 'string' ? message : `HTTP ${response.status}`,
        payload,
      );
    }

    const result = payload as ActionResult<TData> | undefined;
    if (result === undefined || typeof result !== 'object') {
      throw new RestError(response.status, '响应缺少结果信封', payload);
    }
    // REST 三条 controller 的成功/失败体恒带 boolean `success`（07 §0.4）；
    // 裸报告体（如 `/api/health`）不满足该形状，视为误用而非静默通过。
    if (typeof result.success !== 'boolean') {
      throw new RestError(response.status, '响应缺少 success 字段（该 endpoint 不是结果信封形状）', payload);
    }
    if (result.success === false) {
      // REST 业务失败无业务码（07 §0.4），统一 UNKNOWN。
      throw new BusinessError(UNKNOWN_BUSINESS_CODE, result.message, undefined, result);
    }
    return result;
  }
}

/** 认证 API（`@Public`）。 */
export class AuthApi {
  constructor(private readonly client: RestClient) {}

  register(username: string, password: string): Promise<ActionResult<AuthData>> {
    return this.client.request<AuthData>('POST', '/auth/register', { username, password });
  }

  login(username: string, password: string): Promise<ActionResult<AuthData>> {
    return this.client.request<AuthData>('POST', '/auth/login', { username, password });
  }
}

/** 角色 API（需 JWT）。 */
export class CharacterApi {
  constructor(private readonly client: RestClient) {}

  check(): Promise<ActionResult<CharacterData>> {
    return this.client.request<CharacterData>('GET', '/character/check');
  }

  create(nickname: string, gender: 'male' | 'female'): Promise<ActionResult<CharacterData>> {
    return this.client.request<CharacterData>('POST', '/character/create', { nickname, gender });
  }

  info(): Promise<ActionResult<CharacterData>> {
    return this.client.request<CharacterData>('GET', '/character/info');
  }
}

/** REST 聚合入口。 */
export class RestApi {
  readonly auth: AuthApi;
  readonly character: CharacterApi;
  readonly client: RestClient;

  constructor(options: RestApiOptions = {}) {
    this.client = new RestClient(options);
    this.auth = new AuthApi(this.client);
    this.character = new CharacterApi(this.client);
  }
}
