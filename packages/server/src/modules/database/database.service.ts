/**
 * 数据库服务
 *
 * 基于 pg.Pool 提供轻量 query 能力。
 * 所有表仅限用户系统：users / characters。
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import type { QueryResultRow } from 'pg';

const { Pool } = pg;

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: pg.Pool;

  constructor() {
    const connectionString =
      process.env.USER_SERVICE_DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/idle_path_of_xiuxian_user?schema=public';

    this.pool = new Pool({ connectionString });
  }

  async query<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const result = await this.pool.query<T>(sql, params as never[]);
    return {
      rows: result.rows,
      rowCount: result.rowCount,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
