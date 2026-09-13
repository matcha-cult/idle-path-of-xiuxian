/**
 * RestClient / RestApi 边界测试。
 *
 * 重点回归：浏览器里 `fetch` 必须以 `this === window` 调用 ——
 * `const f = window.fetch; this.fetchImpl = f; this.fetchImpl(...)` 会抛
 * `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`。
 * Node 的 undici 不校验 receiver，所以这类 bug 只有断言 receiver 才拦得住。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CharacterApi, RestApi, RestClient, RestError } from '../src/api/rest-api.js';
import { BusinessError } from '../src/client/errors.js';

const ORIGINAL_FETCH = (globalThis as { fetch?: unknown }).fetch;

afterEach(() => {
  (globalThis as { fetch?: unknown }).fetch = ORIGINAL_FETCH;
});

function installFetch(impl: (this: unknown, input: string, init?: RequestInit) => Promise<Response>): void {
  (globalThis as { fetch?: unknown }).fetch = impl;
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as Response;
}

describe('RestClient · fetch receiver（浏览器 Illegal invocation 回归）', () => {
  it('从 globalThis 取到的 fetch 在调用时 this === globalThis', async () => {
    const receivers: unknown[] = [];
    installFetch(function strict(this: unknown) {
      receivers.push(this);
      if (this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(jsonResponse({ success: true, message: 'ok', data: { token: 't' } }));
    });

    const client = new RestClient({ baseUrl: '/api' });
    await expect(client.request('POST', '/auth/login', {})).resolves.toMatchObject({ success: true });
    expect(receivers).toHaveLength(1);
    expect(receivers[0]).toBe(globalThis);
  });

  it('未注入 fetchImpl 时（走 globalThis）也不丢 receiver —— 端到端经 AuthApi 验证', async () => {
    installFetch(function strict(this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(
        jsonResponse({ success: true, message: '注册成功', data: { token: 'jwt', user: { id: 1, username: 'a' } } }),
      );
    });
    const rest = new RestApi({ baseUrl: '/api' });
    await expect(rest.auth.register('alice', 'secret123')).resolves.toMatchObject({ success: true });
  });

  it('注入 fetchImpl 时也正常可用（测试/SSR 场景）', async () => {
    const client = new RestClient({
      baseUrl: '/api',
      fetchImpl: async () => jsonResponse({ success: true, message: 'ok', data: {} }),
    });
    await expect(client.request('GET', '/health')).resolves.toMatchObject({ success: true });
  });
});

describe('RestClient · 信封与错误', () => {
  it('HTTP 200 + success:false → BusinessError（REST 业务失败无业务码）', async () => {
    installFetch(async () => jsonResponse({ success: false, message: '用户名或密码错误' }));
    const client = new RestClient({ baseUrl: '/api' });
    const error = await client.request('POST', '/auth/login', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BusinessError);
    expect((error as BusinessError).code).toBe('UNKNOWN');
    expect((error as BusinessError).serverMessage).toBe('用户名或密码错误');
  });

  it('HTTP 401 → RestError(status=401)，消息取服务端 message', async () => {
    installFetch(async () => jsonResponse({ statusCode: 401, message: '登录状态无效，请重新登录' }, 401));
    const client = new RestClient({ baseUrl: '/api' });
    const error = await client.request('GET', '/character/check').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RestError);
    expect((error as RestError).status).toBe(401);
    expect((error as RestError).message).toBe('登录状态无效，请重新登录');
  });

  it('HTTP 非 2xx 且无 message → 用 HTTP 状态码文案', async () => {
    installFetch(async () => jsonResponse({}, 500));
    const client = new RestClient({ baseUrl: '/api' });
    const error = await client.request('GET', '/x').catch((e: unknown) => e);
    expect((error as RestError).status).toBe(500);
    expect((error as RestError).message).toContain('500');
  });

  it('响应非 JSON → RestError', async () => {
    installFetch(async () => ({ ok: true, status: 200, text: async () => '<html>502</html>' }) as Response);
    const client = new RestClient({ baseUrl: '/api' });
    const error = await client.request('GET', '/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RestError);
    expect((error as RestError).message).toContain('JSON');
  });

  it('响应缺结果信封（如 health 裸报告体）→ RestError', async () => {
    installFetch(async () => jsonResponse({ status: 'ok', checks: {} }));
    const client = new RestClient({ baseUrl: '/api' });
    await expect(client.request('GET', '/health')).rejects.toBeInstanceOf(RestError);
  });

  it('网络异常 → RestError(status=0)', async () => {
    installFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    const client = new RestClient({ baseUrl: '/api' });
    const error = await client.request('GET', '/x').catch((e: unknown) => e);
    expect((error as RestError).status).toBe(0);
    expect((error as RestError).message).toContain('ECONNREFUSED');
  });

  it('tokenProvider 提供 token 时带 Authorization: Bearer；未提供则不带', async () => {
    const seen: Array<Record<string, string>> = [];
    const client = new RestClient({
      baseUrl: '/api/',
      tokenProvider: () => 'jwt-1',
      fetchImpl: async (_input, init) => {
        seen.push((init?.headers ?? {}) as Record<string, string>);
        return jsonResponse({ success: true, message: 'ok', data: {} });
      },
    });
    await client.request('GET', '/character/check');
    expect(seen[0]?.['Authorization']).toBe('Bearer jwt-1');
    // baseUrl 末尾斜杠被裁掉，路径拼接不出现双斜杠
    await client.request('GET', '/x');
    expect(seen).toHaveLength(2);
  });

  it('无 token 时不写 Authorization 与 Content-Type（GET 无 body）', async () => {
    const seen: Array<Record<string, string>> = [];
    const client = new RestClient({
      baseUrl: '/api',
      fetchImpl: async (_input, init) => {
        seen.push((init?.headers ?? {}) as Record<string, string>);
        return jsonResponse({ success: true, message: 'ok', data: {} });
      },
    });
    await client.request('GET', '/x');
    expect(seen[0]).toEqual({});
  });
});

describe('CharacterApi', () => {
  it('create 走 POST /character/create 并带 body', async () => {
    let captured: { url: string; init?: RequestInit } | null = null;
    const api = new CharacterApi(
      new RestClient({
        baseUrl: '/api',
        fetchImpl: async (url, init) => {
          captured = { url, init };
          return jsonResponse({ success: true, message: '角色创建成功', data: { hasCharacter: true, character: null } });
        },
      }),
    );
    await api.create('道友', 'female');
    expect(captured?.url).toBe('/api/character/create');
    expect(captured?.init?.method).toBe('POST');
    expect(captured?.init?.body).toBe(JSON.stringify({ nickname: '道友', gender: 'female' }));
  });
});
