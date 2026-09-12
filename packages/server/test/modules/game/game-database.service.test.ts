import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GameDatabaseService } from '../../../src/modules/game/game-database.service.js';
import { stub } from '../../helpers/stub.js';

/** 假 Pool：只实现服务用到的 query / connect / end */
function makePool() {
  const client = {
    query: stub(async (_sql: string, _params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }> => ({
      rows: [],
      rowCount: 0,
    })),
    release: stub(() => undefined),
  };
  const pool = {
    query: stub(async (_sql: string, _params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }> => ({
      rows: [{ n: 1 }],
      rowCount: 1,
    })),
    connect: stub(async () => client),
    end: stub(async () => undefined),
  };
  return { pool, client };
}

interface PoolLike {
  query: unknown;
  connect: unknown;
  end: unknown;
}

/** 运行时替换私有 pool（TS private 仅编译期） */
function injectPool(svc: GameDatabaseService, pool: unknown): void {
  (svc as unknown as { pool: unknown }).pool = pool;
}

describe('GameDatabaseService.query 边界', () => {
  test('透传 sql/params 并映射 rowCount', async () => {
    const { pool } = makePool();
    const svc = new GameDatabaseService();
    injectPool(svc, pool);
    try {
      const res = await svc.query('SELECT 1', [42]);
      assert.deepEqual(res.rows, [{ n: 1 }]);
      assert.equal(res.rowCount, 1);
      assert.deepEqual(pool.query.last, ['SELECT 1', [42]]);
    } finally {
      await svc.onModuleDestroy();
    }
  });

  test('params 缺省 -> 传 []', async () => {
    const { pool } = makePool();
    const svc = new GameDatabaseService();
    injectPool(svc, pool);
    try {
      await svc.query('SELECT 1');
      assert.deepEqual(pool.query.last, ['SELECT 1', []]);
    } finally {
      await svc.onModuleDestroy();
    }
  });

  test('pool 抛错 -> 原样向上抛出', async () => {
    const { pool } = makePool();
    pool.query = stub(async () => {
      throw new Error('pool down');
    }) as typeof pool.query;
    const svc = new GameDatabaseService();
    injectPool(svc, pool);
    try {
      await assert.rejects(svc.query('SELECT 1'), /pool down/);
    } finally {
      await svc.onModuleDestroy();
    }
  });

  test('rowCount 为 null 时原样返回', async () => {
    const { pool } = makePool();
    pool.query = stub(async () => ({ rows: [], rowCount: null })) as typeof pool.query;
    const svc = new GameDatabaseService();
    injectPool(svc, pool);
    try {
      const res = await svc.query('SELECT 1');
      assert.equal(res.rowCount, null);
    } finally {
      await svc.onModuleDestroy();
    }
  });
});

describe('GameDatabaseService.withTransaction 边界', () => {
  test('成功 -> BEGIN/业务 SQL/COMMIT 且 release 一次', async () => {
    const { pool, client } = makePool();
    const svc = new GameDatabaseService();
    injectPool(svc, pool);
    try {
      const result = await svc.withTransaction(async (tx) => {
        const r = await tx.query('UPDATE x SET a = $1', [1]);
        assert.deepEqual(r.rows, []);
        assert.equal(r.rowCount, 0);
        return 'ok';
      });
      assert.equal(result, 'ok');
      assert.deepEqual(client.query.calls.map((c) => c[0]), ['BEGIN', 'UPDATE x SET a = $1', 'COMMIT']);
      assert.deepEqual(client.query.calls[1][1], [1]);
      assert.equal(client.release.callCount, 1);
    } finally {
      await svc.onModuleDestroy();
    }
  });

  test('业务抛错 -> ROLLBACK 后重新抛出且 release 一次', async () => {
    const { pool, client } = makePool();
    client.query = stub(async (sql: string): Promise<{ rows: unknown[]; rowCount: number | null }> => {
      if (sql === 'UPDATE x') throw new Error('boom');
      return { rows: [], rowCount: 0 };
    }) as typeof client.query;
    const svc = new GameDatabaseService();
    injectPool(svc, pool);
    try {
      await assert.rejects(
        svc.withTransaction(async (tx) => {
          await tx.query('UPDATE x');
        }),
        /boom/,
      );
      assert.deepEqual(client.query.calls.map((c) => c[0]), ['BEGIN', 'UPDATE x', 'ROLLBACK']);
      assert.equal(client.release.callCount, 1);
    } finally {
      await svc.onModuleDestroy();
    }
  });

  test('BEGIN 抛错 -> 仍尝试 ROLLBACK 且 release', async () => {
    const { pool, client } = makePool();
    client.query = stub(async (sql: string): Promise<{ rows: unknown[]; rowCount: number | null }> => {
      if (sql === 'BEGIN') throw new Error('begin fail');
      return { rows: [], rowCount: 0 };
    }) as typeof client.query;
    const svc = new GameDatabaseService();
    injectPool(svc, pool);
    try {
      await assert.rejects(
        svc.withTransaction(async () => 'never'),
        /begin fail/,
      );
      assert.deepEqual(client.query.calls.map((c) => c[0]), ['BEGIN', 'ROLLBACK']);
      assert.equal(client.release.callCount, 1);
    } finally {
      await svc.onModuleDestroy();
    }
  });
});

describe('GameDatabaseService 生命周期与连接串 边界', () => {
  test('onModuleDestroy -> 调用 pool.end()', async () => {
    const { pool } = makePool();
    const svc = new GameDatabaseService();
    injectPool(svc, pool);
    await svc.onModuleDestroy();
    assert.equal(pool.end.callCount, 1);
  });

  test('DATABASE_URL 优先生效', async () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://u:p@127.0.0.1:5432/idle_game';
    const svc = new GameDatabaseService();
    try {
      const options = (svc as unknown as { pool: { options?: { connectionString?: string } } }).pool.options;
      assert.equal(options?.connectionString, process.env.DATABASE_URL);
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
      await svc.onModuleDestroy();
    }
  });

  test('未设 DATABASE_URL -> 用 DB_* 拼装连接串', async () => {
    const saved = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_USER: process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      DB_HOST: process.env.DB_HOST,
      DB_PORT: process.env.DB_PORT,
      DB_NAME: process.env.DB_NAME,
    };
    delete process.env.DATABASE_URL;
    process.env.DB_USER = 'alice';
    process.env.DB_PASSWORD = 'secret';
    process.env.DB_HOST = 'db.host';
    process.env.DB_PORT = '5555';
    process.env.DB_NAME = 'my_game';
    const svc = new GameDatabaseService();
    try {
      const options = (svc as unknown as { pool: { options?: { connectionString?: string } } }).pool.options;
      assert.equal(
        options?.connectionString,
        'postgresql://alice:secret@db.host:5555/my_game?schema=public',
      );
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await svc.onModuleDestroy();
    }
  });
});
