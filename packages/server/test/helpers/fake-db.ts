/**
 * 测试用假数据库：按 SQL 正则分发固定结果，并记录全部调用。
 * 结构上兼容 DatabaseService / GameDatabaseService（二者只需 query）。
 */
export interface SqlResponse<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number | null;
}

export interface QueryCall {
  sql: string;
  params: unknown[];
}

export class FakeDatabase {
  readonly calls: QueryCall[] = [];
  private readonly handlers: Array<{ match: RegExp; respond: (params: unknown[], sql: string) => SqlResponse | Promise<SqlResponse> }> = [];
  private fallback: ((sql: string, params: unknown[]) => SqlResponse | Promise<SqlResponse>) | null = null;

  on(match: RegExp, respond: SqlResponse | ((params: unknown[], sql: string) => SqlResponse | Promise<SqlResponse>)): this {
    this.handlers.push({
      match,
      respond: typeof respond === 'function' ? respond : () => respond,
    });
    return this;
  }

  onFallback(fn: (sql: string, params: unknown[]) => SqlResponse | Promise<SqlResponse>): this {
    this.fallback = fn;
    return this;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    this.calls.push({ sql, params });
    const handler = this.handlers.find((h) => h.match.test(sql));
    const result = await (handler
      ? handler.respond(params, sql)
      : this.fallback
        ? this.fallback(sql, params)
        : { rows: [] });
    return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length };
  }

  callsMatching(match: RegExp): QueryCall[] {
    return this.calls.filter((c) => match.test(c.sql));
  }

  lastCall(match?: RegExp): QueryCall | undefined {
    const list = match ? this.callsMatching(match) : this.calls;
    return list[list.length - 1];
  }

  get callCount(): number {
    return this.calls.length;
  }
}

/** 把 FakeDatabase 当作真服务的 DatabaseService 依赖使用 */
export function asDatabase(fake: FakeDatabase): never {
  return fake as never;
}
