// ============================================================================
// T1 · 秘境解锁体系（§22）—— **纯增量 DDL 迁移**
//
// 只做「加列 / 建表 / 放宽 NOT NULL」，**不删任何列、不重灌种子、不动任何 id、不删任何玩家数据**。
// 目的是让 T1 单独落地时门禁全绿（行为不变），真正的语义切换在 T2（种子）/ T3（zone 域）/
// T4（拆 P3.0 对地图节点的硬依赖）里发生。物理删列留到收尾 T10。
//
// 与 `init-game-db.mjs` 的 DDL **必须逐字一致** —— 本脚本是"已有库"的那条路，
// `init-game-db.mjs` 是"新装库"的那条路。两条路走完后的表结构应当完全一样，
// `packages/server/test/modules/game/zone-schema.test.ts` 用 psql 实测守着这一点。
//
// 幂等：可重复执行。每一步都是 ADD COLUMN IF NOT EXISTS / DROP NOT NULL（后者天然幂等）。
//
// 用法：node scripts/migrate-realm-unlock.mjs
// ============================================================================
import pg from 'pg';
import 'dotenv/config';

/** 期望的最终列定义：列名 → { type, nullable, default }（用于收尾自检，不做 DDL） */
const EXPECTED_ZONE_COLUMNS = {
  realm: { nullable: true },
  tier_kind: { nullable: false, hasDefault: true },
  unlock_item_code: { nullable: true },
  idle_allowed: { nullable: false, hasDefault: true },
};

const EXPECTED_PROGRESS_COLUMNS = {
  clears: { nullable: false, hasDefault: true },
};

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const applied = [];

async function run(label, sql) {
  await client.query(sql);
  applied.push(label);
}

// ===== 1. game_zones：新增 4 列（§22 §5.1）=====
await run(
  'game_zones.realm',
  'ALTER TABLE game_zones ADD COLUMN IF NOT EXISTS realm SMALLINT',
);
await run(
  'game_zones.tier_kind',
  "ALTER TABLE game_zones ADD COLUMN IF NOT EXISTS tier_kind VARCHAR(16) NOT NULL DEFAULT 'training'",
);
await run(
  'game_zones.unlock_item_code',
  'ALTER TABLE game_zones ADD COLUMN IF NOT EXISTS unlock_item_code VARCHAR(64)',
);
await run(
  'game_zones.idle_allowed',
  'ALTER TABLE game_zones ADD COLUMN IF NOT EXISTS idle_allowed BOOLEAN NOT NULL DEFAULT FALSE',
);
await run('game_zones.idx_realm', 'CREATE INDEX IF NOT EXISTS idx_game_zones_realm ON game_zones(realm)');

// ===== 2. game_zones：旧列放宽为可空（语义作废，物理删列留到 T10）=====
await run('game_zones.chapter → nullable', 'ALTER TABLE game_zones ALTER COLUMN chapter DROP NOT NULL');
await run('game_zones.min_realm → nullable', 'ALTER TABLE game_zones ALTER COLUMN min_realm DROP NOT NULL');

// ===== 3. game_zone_progress：新增 clears（§22 §5.2）=====
await run(
  'game_zone_progress.clears',
  'ALTER TABLE game_zone_progress ADD COLUMN IF NOT EXISTS clears INTEGER NOT NULL DEFAULT 0',
);

// ===== 4. game_idle_state：新表（§22 §5.3）=====
await run(
  'game_idle_state (table)',
  `CREATE TABLE IF NOT EXISTS game_idle_state (
     id           SERIAL PRIMARY KEY,
     character_id INTEGER NOT NULL UNIQUE,
     zone_id      INTEGER NOT NULL,
     updated_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
);
await run(
  'game_idle_state.idx_zone',
  'CREATE INDEX IF NOT EXISTS idx_game_idle_state_zone ON game_idle_state(zone_id)',
);

// ===== 5. game_chapters：zone_code 放宽为可空（§22 Q1 章节与秘境解绑）=====
await run('game_chapters.zone_code → nullable', 'ALTER TABLE game_chapters ALTER COLUMN zone_code DROP NOT NULL');

// ===== 收尾自检：不信"没报错就是成功"，逐列问 information_schema =====
const { rows: zoneCols } = await client.query(
  `SELECT column_name, is_nullable, column_default
     FROM information_schema.columns
    WHERE table_name = 'game_zones'`,
);
const zoneByName = new Map(zoneCols.map((r) => [r.column_name, r]));
const { rows: progressCols } = await client.query(
  `SELECT column_name, is_nullable, column_default
     FROM information_schema.columns
    WHERE table_name = 'game_zone_progress'`,
);
const progressByName = new Map(progressCols.map((r) => [r.column_name, r]));

const problems = [];

function check(map, table, columns) {
  for (const [name, spec] of Object.entries(columns)) {
    const row = map.get(name);
    if (!row) {
      problems.push(`${table}.${name} 不存在`);
      continue;
    }
    if (spec.nullable === false && row.is_nullable === 'YES') {
      problems.push(`${table}.${name} 应为 NOT NULL，实际可空`);
    }
    if (spec.nullable === true && row.is_nullable === 'NO') {
      problems.push(`${table}.${name} 应为可空，实际 NOT NULL`);
    }
    if (spec.hasDefault && row.column_default == null) {
      problems.push(`${table}.${name} 缺少默认值`);
    }
  }
}
check(zoneByName, 'game_zones', EXPECTED_ZONE_COLUMNS);
check(progressByName, 'game_zone_progress', EXPECTED_PROGRESS_COLUMNS);

for (const [name, wantNullable] of [
  ['chapter', true],
  ['min_realm', true],
]) {
  const row = zoneByName.get(name);
  if (!row) problems.push(`game_zones.${name} 不存在（T10 之前不应删列）`);
  else if (wantNullable && row.is_nullable !== 'YES') problems.push(`game_zones.${name} 应为可空（语义作废）`);
}

const { rows: idleTable } = await client.query(
  "SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_name = 'game_idle_state'",
);
if (Number(idleTable[0].c) !== 1) problems.push('game_idle_state 表不存在');

const { rows: chapterZone } = await client.query(
  `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'game_chapters' AND column_name = 'zone_code'`,
);
if (chapterZone.length !== 1) problems.push('game_chapters.zone_code 不存在');
else if (chapterZone[0].is_nullable !== 'YES') problems.push('game_chapters.zone_code 应为可空（§22 Q1 解绑）');

console.log('[§22 T1] 已执行：');
for (const label of applied) console.log('  + ' + label);

if (problems.length > 0) {
  console.error('\n[§22 T1] ❌ 迁移自检失败：');
  for (const p of problems) console.error('  - ' + p);
  await client.end();
  process.exit(1);
}
console.log('\n[§22 T1] ✅ 迁移自检通过（game_zones ×4 列 / game_zone_progress ×1 列 / game_idle_state 新表 / game_chapters.zone_code 可空）');

await client.end();
