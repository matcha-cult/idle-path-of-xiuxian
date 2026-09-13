/**
 * SessionStore 边界：本地恢复、登录/注册、REST 业务失败、401 兜底、登出清理。
 */
import { describe, expect, it } from 'vitest';
import { RestApi, type FetchLike } from '@idle-path/ionet-transport';
import { SessionStore, TOKEN_STORAGE_KEY, USER_STORAGE_KEY, type StorageLike } from '../src/stores/session-store.js';
import { ToastStore } from '../src/stores/toast-store.js';

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  raw(): Map<string, string> {
    return this.map;
  }
}

interface FakeReply {
  status?: number;
  body: unknown;
}

/** 按 URL 片段路由的假 fetch。 */
function fakeFetch(routes: Array<{ match: string; reply: FakeReply }>): FetchLike {
  return async (input: string) => {
    const route = routes.find((r) => input.includes(r.match));
    if (route === undefined) throw new Error(`fakeFetch: 未匹配 ${input}`);
    const status = route.reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(route.reply.body),
    } as Response;
  };
}

function makeSession(fetchImpl: FetchLike, storage = new MemoryStorage()): { session: SessionStore; toast: ToastStore; storage: MemoryStorage } {
  const toast = new ToastStore();
  const rest = new RestApi({ baseUrl: '/api', fetchImpl });
  const session = new SessionStore(rest, storage, toast);
  return { session, toast, storage };
}

const LOGIN_OK: FakeReply = {
  body: { success: true, message: '登录成功', data: { token: 'jwt-1', user: { id: 7, username: 'alice' } } },
};

describe('SessionStore · 本地恢复', () => {
  it('无 token → anonymous', () => {
    const { session } = makeSession(fakeFetch([]));
    expect(session.restore()).toBe(false);
    expect(session.status).toBe('anonymous');
    expect(session.isAuthenticated).toBe(false);
  });

  it('有 token + user → authenticated', () => {
    const storage = new MemoryStorage();
    storage.setItem(TOKEN_STORAGE_KEY, 'jwt-x');
    storage.setItem(USER_STORAGE_KEY, JSON.stringify({ id: 1, username: 'bob' }));
    const { session } = makeSession(fakeFetch([]), storage);
    expect(session.restore()).toBe(true);
    expect(session.status).toBe('authenticated');
    expect(session.user?.username).toBe('bob');
  });

  it('user JSON 损坏 → user=null 但 token 仍恢复', () => {
    const storage = new MemoryStorage();
    storage.setItem(TOKEN_STORAGE_KEY, 'jwt-x');
    storage.setItem(USER_STORAGE_KEY, '{bad json');
    const { session } = makeSession(fakeFetch([]), storage);
    expect(session.restore()).toBe(true);
    expect(session.user).toBeNull();
  });

  it('空串 token 视为未登录', () => {
    const storage = new MemoryStorage();
    storage.setItem(TOKEN_STORAGE_KEY, '');
    const { session } = makeSession(fakeFetch([]), storage);
    expect(session.restore()).toBe(false);
  });
});

describe('SessionStore · 登录 / 注册', () => {
  it('登录成功 → 写入 token/user 与本地存储', async () => {
    const { session, storage } = makeSession(fakeFetch([{ match: '/auth/login', reply: LOGIN_OK }]));
    await expect(session.login('alice', 'secret')).resolves.toBe(true);
    expect(session.token).toBe('jwt-1');
    expect(session.user).toEqual({ id: 7, username: 'alice' });
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('jwt-1');
  });

  it('REST 业务失败（HTTP 200 + success:false）→ false + Toast，不写存储', async () => {
    const { session, toast, storage } = makeSession(
      fakeFetch([{ match: '/auth/login', reply: { body: { success: false, message: '用户名或密码错误' } } }]),
    );
    await expect(session.login('alice', 'wrong')).resolves.toBe(false);
    expect(session.token).toBeNull();
    expect(session.status).toBe('error');
    expect(toast.toasts).toHaveLength(1);
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('鉴权失败（HTTP 401）→ false + Toast', async () => {
    const { session, toast } = makeSession(
      fakeFetch([{ match: '/auth/login', reply: { status: 401, body: { message: 'Unauthorized' } } }]),
    );
    await expect(session.login('alice', 'secret')).resolves.toBe(false);
    expect(session.status).toBe('error');
    expect(toast.toasts[0]?.title).toContain('重新登录');
  });

  it('成功但缺 data → 视为失败', async () => {
    const { session } = makeSession(
      fakeFetch([{ match: '/auth/register', reply: { body: { success: true, message: 'ok' } } }]),
    );
    await expect(session.register('alice', 'secret')).resolves.toBe(false);
    expect(session.token).toBeNull();
  });

  it('网络异常 → false 且不崩溃', async () => {
    const { session } = makeSession(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(session.login('alice', 'secret')).resolves.toBe(false);
    expect(session.status).toBe('error');
  });
});

describe('SessionStore · 角色与登出', () => {
  it('loadCharacter 无 token → false 且不发请求', async () => {
    const { session } = makeSession(fakeFetch([]));
    await expect(session.loadCharacter()).resolves.toBe(false);
  });

  it('loadCharacter 401 → 自动登出', async () => {
    const { session, storage } = makeSession(
      fakeFetch([
        { match: '/auth/login', reply: LOGIN_OK },
        { match: '/character/check', reply: { status: 401, body: { message: 'Unauthorized' } } },
      ]),
    );
    await session.login('alice', 'secret');
    expect(session.isAuthenticated).toBe(true);
    await session.loadCharacter();
    expect(session.isAuthenticated).toBe(false);
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('createCharacter 成功 → hasCharacter=true', async () => {
    const { session } = makeSession(
      fakeFetch([
        { match: '/auth/login', reply: LOGIN_OK },
        {
          match: '/character/create',
          reply: {
            body: {
              success: true,
              message: '角色创建成功',
              data: {
                hasCharacter: true,
                character: {
                  id: 3,
                  userId: 7,
                  nickname: '道友',
                  gender: 'male',
                  title: '散修',
                  spiritStones: 10000,
                  silver: 0,
                  realm: 1,
                  lingyun: 0,
                  jadeSlips: 0,
                },
              },
            },
          },
        },
      ]),
    );
    await session.login('alice', 'secret');
    await expect(session.createCharacter('道友', 'male')).resolves.toBe(true);
    expect(session.hasCharacter).toBe(true);
    expect(session.character?.nickname).toBe('道友');
  });

  it('logout 清空内存与存储', async () => {
    const { session, storage } = makeSession(fakeFetch([{ match: '/auth/login', reply: LOGIN_OK }]));
    await session.login('alice', 'secret');
    session.logout();
    expect(session.token).toBeNull();
    expect(session.user).toBeNull();
    expect(session.status).toBe('anonymous');
    expect(storage.raw().size).toBe(0);
  });

  it('handleUnauthorized 在已登出时不重复提示', async () => {
    const { session, toast } = makeSession(fakeFetch([]));
    session.handleUnauthorized();
    expect(toast.toasts).toHaveLength(0);
  });
});
