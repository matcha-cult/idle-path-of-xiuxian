/**
 * 初始化用户系统数据库表
 *
 * 运行：pnpm --filter ./packages/server db:init
 */
import 'dotenv/config';
import pg from 'pg';

const connectionString =
  process.env.USER_SERVICE_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/idle_path_of_xiuxian_user?schema=public';

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
  silver        BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
`;

try {
  await client.connect();
  await client.query(sql);
  console.log('[放置·修仙之路] user database initialized');
} finally {
  await client.end();
}
