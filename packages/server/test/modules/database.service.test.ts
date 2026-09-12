import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService } from '../../src/modules/database/database.service.js';

/**
 * 注意：本文件只覆盖「构造 + 环境变量 + 生命周期」，绝不在测试里执行真实查询
 * （query 需要真实 PG 连接，属于 integration/e2e，见 scripts/e2e-*.mts）。
 * pg.Pool 是惰性连接：构造与 end() 在从未 query 的情况下不会建立网络连接，
 * 因此这里可以安全地验证 onModuleDestroy。
 */

const ENV_KEYS = ['DATABASE_URL', 'DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DB_NAME'] as const;
type EnvKey = (typeof ENV_KEYS)[number];

/** 临时改写环境变量，并在 finally 中还原，避免用例间互相污染。 */
async function withEnv<T>(
  env: Partial<Record<EnvKey, string | undefined>>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const saved = new Map<EnvKey, string | undefined>();
  for (const k of ENV_KEYS) saved.set(k, process.env[k]);
  for (const k of ENV_KEYS) {
    const value = env[k];
    if (value === undefined) delete process.env[k];
    else process.env[k] = value;
  }
  try {
    return await fn();
  } finally {
    for (const k of ENV_KEYS) {
      const value = saved.get(k);
      if (value === undefined) delete process.env[k];
      else process.env[k] = value;
    }
  }
}

function connectionStringOf(svc: DatabaseService): string | undefined {
  const cast = svc as unknown as { pool: { options: { connectionString?: string } } };
  return cast.pool.options.connectionString;
}

describe('DatabaseService 构造 / 环境变量边界', () => {
  test('DATABASE_URL 存在 -> 构造不抛错且 pool 使用该连接串', async () => {
    await withEnv({ DATABASE_URL: 'postgresql://u:p@db-host:6000/mydb' }, () => {
      let svc: DatabaseService | undefined;
      assert.doesNotThrow(() => {
        svc = new DatabaseService();
      });
      assert.equal(connectionStringOf(svc as DatabaseService), 'postgresql://u:p@db-host:6000/mydb');
    });
  });

  test('DATABASE_URL 缺失 -> 用 DB_* 拼默认连接串', async () => {
    await withEnv(
      { DATABASE_URL: undefined, DB_USER: 'alice', DB_PASSWORD: 'pw', DB_HOST: 'h', DB_PORT: '6543', DB_NAME: 'game' },
      () => {
        const svc = new DatabaseService();
        assert.equal(connectionStringOf(svc), 'postgresql://alice:pw@h:6543/game?schema=public');
      },
    );
  });

  test('DATABASE_URL/DB_* 均缺失 -> 使用全部默认值', async () => {
    await withEnv(
      {
        DATABASE_URL: undefined,
        DB_USER: undefined,
        DB_PASSWORD: undefined,
        DB_HOST: undefined,
        DB_PORT: undefined,
        DB_NAME: undefined,
      },
      () => {
        const svc = new DatabaseService();
        assert.equal(
          connectionStringOf(svc),
          'postgresql://postgres:postgres@localhost:5432/idle_game?schema=public',
        );
      },
    );
  });

  test('DATABASE_URL 为空串（非 null/undefined）-> 不抛错，空串优先于默认值', async () => {
    await withEnv({ DATABASE_URL: '' }, () => {
      let svc: DatabaseService | undefined;
      assert.doesNotThrow(() => {
        svc = new DatabaseService();
      });
      assert.equal(connectionStringOf(svc as DatabaseService), '');
    });
  });

  test('DB_PORT 非数字（类型不符）-> 构造不抛错，连接串原样保留', async () => {
    await withEnv({ DATABASE_URL: undefined, DB_PORT: 'not-a-port' }, () => {
      const svc = new DatabaseService();
      assert.match(String(connectionStringOf(svc)), /not-a-port/);
    });
  });

  test('非法 DATABASE_URL 格式 -> 构造不抛错（解析延迟到连接时）', async () => {
    await withEnv({ DATABASE_URL: 'not-a-url' }, () => {
      assert.doesNotThrow(() => {
        new DatabaseService();
      });
    });
  });

  test('公开方法存在：query / onModuleDestroy', async () => {
    await withEnv({ DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/idle_game?schema=public' }, () => {
      const svc = new DatabaseService();
      assert.equal(typeof svc.query, 'function');
      assert.equal(typeof svc.onModuleDestroy, 'function');
    });
  });

  test('从未连接时 onModuleDestroy 可直接结束（不发起真实连接）', async () => {
    await withEnv({ DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/idle_game?schema=public' }, async () => {
      const svc = new DatabaseService();
      await assert.doesNotReject(() => svc.onModuleDestroy());
    });
  });

  test('重复构造多个实例互不影响，且都能正常结束', async () => {
    await withEnv({ DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/idle_game?schema=public' }, async () => {
      const a = new DatabaseService();
      const b = new DatabaseService();
      assert.notEqual(a, b);
      await assert.doesNotReject(() => Promise.all([a.onModuleDestroy(), b.onModuleDestroy()]));
    });
  });
});
