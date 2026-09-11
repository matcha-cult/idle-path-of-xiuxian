/**
 * Game 系统数据库服务（与用户系统共用统一库 idle_game）
 *
 * - 连接串走 env：DATABASE_URL（由 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME 拼装）
 * - 基于 pg.Pool 提供 query 与事务能力
 * - 仅承载 game 库表：game_item_bases / game_affixes / game_base_affix_pools /
 *   game_items / game_equipment / game_pickup_rules
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';

const { Pool } = pg;

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

/** 事务句柄：与 DatabaseService.query 同签名，便于业务代码复用 */
export interface GameTx {
  query<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

@Injectable()
export class GameDatabaseService implements OnModuleDestroy {
  private readonly pool: pg.Pool;

  constructor() {
    const connectionString =
      process.env.DATABASE_URL ??
      `postgresql://${process.env.DB_USER ?? 'postgres'}:${process.env.DB_PASSWORD ?? 'postgres'}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5432'}/${process.env.DB_NAME ?? 'idle_game'}?schema=public`;
    this.pool = new Pool({ connectionString });
  }

  async query<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const result = await this.pool.query<T>(sql, params as never[]);
    return { rows: result.rows, rowCount: result.rowCount };
  }

  /** 事务包装：fn 内通过 tx.query 执行，任一步抛错则整体回滚 */
  async withTransaction<T>(fn: (tx: GameTx) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    const tx: GameTx = {
      query: async <R extends QueryResultRow = Record<string, unknown>>(
        sql: string,
        params: unknown[] = [],
      ): Promise<QueryResult<R>> => {
        const result = await client.query<R>(sql, params as never[]);
        return { rows: result.rows, rowCount: result.rowCount };
      },
    };
    try {
      await client.query('BEGIN');
      const value = await fn(tx);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
