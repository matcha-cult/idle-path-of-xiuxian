/**
 * 初始化用户系统数据库表
 *
 * 运行：pnpm --filter ./packages/server db:init
 */
import 'dotenv/config';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.DB_USER ?? 'postgres'}:${process.env.DB_PASSWORD ?? 'postgres'}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5432'}/${process.env.DB_NAME ?? 'idle_game'}?schema=public`;

const client = new pg.Client({ connectionString });

const sql = `
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(50) NOT NULL UNIQUE,
  password    VARCHAR(255),
  created_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login  TIMESTAMP(6),
  status      SMALLINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS characters (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  nickname      VARCHAR(50) NOT NULL,
  gender        VARCHAR(10) NOT NULL,
  title         VARCHAR(50) DEFAULT '散修',
  spirit_stones BIGINT NOT NULL DEFAULT 10000,
  silver        BIGINT NOT NULL DEFAULT 0, -- （弃用）银两，不再使用
  realm         SMALLINT NOT NULL DEFAULT 1, -- 当前境界序号 1~14
  lingyun       BIGINT NOT NULL DEFAULT 0, -- 灵韵（角色绑定成长资源）
  jade_slips    BIGINT NOT NULL DEFAULT 0, -- 未开光玉简计数（P2 占位，P4 物品化）
  last_settle_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 离线收益结算锚点（P4.2，带时区避免 naive 偏差）
  created_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);

-- 兼容已有库：增量补列（幂等）
ALTER TABLE characters ADD COLUMN IF NOT EXISTS realm SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS lingyun BIGINT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS jade_slips BIGINT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS last_settle_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- 兼容首轮已建为 timestamp（naive，UTC 写入）的库：迁移为 timestamptz
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'characters'
      AND column_name = 'last_settle_at' AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE characters ALTER COLUMN last_settle_at TYPE TIMESTAMPTZ USING last_settle_at AT TIME ZONE 'UTC';
  END IF;
END $$;
`;

try {
  await client.connect();
  await client.query(sql);
  console.log('[放置·修仙之路] user database initialized');
} finally {
  await client.end();
}
