/**
 * §22 秘境解锁体系 · **表结构两条路径的一致性**（纯静态 lint，不连数据库）。
 *
 * 背景：本仓没有 prisma migrations，表结构有**两条路**：
 *   1. `scripts/init-game-db.mjs`  —— **新装库**：CREATE TABLE + ALTER 兜底，建出完整结构；
 *   2. `scripts/migrate-realm-unlock.mjs` —— **已有库**：只做增量 ALTER。
 *
 * 这两条路一旦漂移，会出现最难查的一类 bug：**开发机（迁移过）全绿，新装库（fresh）炸**，
 * 或者反过来。所以把「两边都声明了同一批列」固化成断言。
 *
 * 同时守三条 §22 的结构红线：
 *   - `game_zones` 的新 4 列必须存在（realm / tier_kind / unlock_item_code / idle_allowed）；
 *   - 语义作废的旧列（chapter / min_realm）必须**放宽为可空但尚未删除**（T10 之前）；
 *   - 迁移脚本每一步都必须**幂等**（IF NOT EXISTS 或 DROP NOT NULL），否则重复执行会炸。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const INIT_SQL = readFileSync(new URL('../../../scripts/init-game-db.mjs', import.meta.url), 'utf8');
const MIGRATE_SQL = readFileSync(
  new URL('../../../scripts/migrate-realm-unlock.mjs', import.meta.url),
  'utf8',
);

/** 抽出 `CREATE TABLE [IF NOT EXISTS] <name> ( ... );` 的列名集合（按行首缩进的标识符判定）。 */
function tableColumns(sql: string, table: string): Set<string> {
  const re = new RegExp(`CREATE TABLE(?: IF NOT EXISTS)?\\s+${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'm');
  const m = sql.match(re);
  assert.ok(m, `未能在 DDL 中找到 CREATE TABLE ${table}`);
  const cols = new Set<string>();
  for (const line of m[1].split('\n')) {
    const hit = line.match(/^\s{2}([a-z_][a-z0-9_]*)\s+[A-Z]/);
    if (hit) cols.add(hit[1]);
  }
  return cols;
}

describe('§22 game_zones 表结构：新装 vs 迁移 两条路一致', () => {
  /** §22 §5.1 要求新增的 4 列 */
  const NEW_ZONE_COLUMNS = ['realm', 'tier_kind', 'unlock_item_code', 'idle_allowed'];

  test('init-game-db.mjs 的 CREATE TABLE 声明了全部新列', () => {
    const cols = tableColumns(INIT_SQL, 'game_zones');
    for (const c of NEW_ZONE_COLUMNS) {
      assert.ok(cols.has(c), `init-game-db.mjs 的 game_zones 缺少列 ${c}`);
    }
  });

  test('migrate-realm-unlock.mjs 为每一列都追加了 ALTER（两条路不得漂移）', () => {
    for (const c of NEW_ZONE_COLUMNS) {
      assert.ok(
        MIGRATE_SQL.includes(`game_zones ADD COLUMN IF NOT EXISTS ${c}`),
        `迁移脚本没有为 game_zones.${c} 补列 —— 已有库会缺这一列`,
      );
    }
  });

  test('init-game-db.mjs 同样为每一列留了 ALTER 兜底（老库跑 init 也能补齐）', () => {
    for (const c of NEW_ZONE_COLUMNS) {
      assert.ok(
        INIT_SQL.includes(`game_zones ADD COLUMN IF NOT EXISTS ${c}`),
        `init-game-db.mjs 缺少 game_zones.${c} 的 ALTER 兜底`,
      );
    }
  });

  test('新增列的类型与默认值与 §22 §5.1 一致', () => {
    // tier_kind：NOT NULL DEFAULT 'training'（历练是缺省类，special 必须显式声明）
    assert.match(INIT_SQL, /tier_kind\s+VARCHAR\(16\) NOT NULL DEFAULT 'training'/);
    assert.match(MIGRATE_SQL, /tier_kind VARCHAR\(16\) NOT NULL DEFAULT 'training'/);
    // idle_allowed：NOT NULL DEFAULT FALSE —— 缺省**不可挂机**（安全侧：新秘境不会意外开放挂机）
    assert.match(INIT_SQL, /idle_allowed\s+BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(MIGRATE_SQL, /idle_allowed BOOLEAN NOT NULL DEFAULT FALSE/);
    // realm / unlock_item_code 可空（realm 在 T2 种子重灌前为空；unlock_item_code 只在 special 上有值）
    assert.match(INIT_SQL, /realm\s+SMALLINT,/);
    assert.match(INIT_SQL, /unlock_item_code\s+VARCHAR\(64\),/);
  });
});

describe('§22 语义作废的旧列：放宽为可空，但 T10 之前不得删除', () => {
  test('game_zones.chapter / min_realm 已 DROP NOT NULL（两条路都要有）', () => {
    for (const col of ['chapter', 'min_realm']) {
      assert.ok(
        INIT_SQL.includes(`ALTER TABLE game_zones ALTER COLUMN ${col} DROP NOT NULL`),
        `init-game-db.mjs 没有放宽 game_zones.${col}`,
      );
      assert.ok(
        MIGRATE_SQL.includes(`ALTER TABLE game_zones ALTER COLUMN ${col} DROP NOT NULL`),
        `迁移脚本没有放宽 game_zones.${col}`,
      );
    }
  });

  test('旧列仍存在于 CREATE TABLE（T10 之前删除会打断仍在使用它们的代码）', () => {
    const cols = tableColumns(INIT_SQL, 'game_zones');
    for (const col of ['chapter', 'min_realm', 'require_prev_best_floor']) {
      assert.ok(cols.has(col), `game_zones.${col} 被提前删除了 —— §22 §11 把它排在 T10`);
    }
  });

  test('旧列定义里不再写 NOT NULL（写了就与 DROP NOT NULL 自相矛盾）', () => {
    const m = INIT_SQL.match(/CREATE TABLE(?: IF NOT EXISTS)?\s+game_zones\s*\(([\s\S]*?)\n\);/);
    assert.ok(m);
    for (const col of ['chapter', 'min_realm']) {
      const line = m[1].split('\n').find((l) => new RegExp(`^\\s{2}${col}\\s`).test(l));
      assert.ok(line, `找不到 game_zones.${col} 的定义行`);
      assert.ok(!/NOT NULL/.test(line), `game_zones.${col} 仍是 NOT NULL：${line.trim()}`);
    }
  });
});

describe('§22 game_zone_progress.clears 与 game_idle_state', () => {
  test('clears 列两条路都有，且是 NOT NULL DEFAULT 0', () => {
    assert.ok(tableColumns(INIT_SQL, 'game_zone_progress').has('clears'));
    assert.match(INIT_SQL, /clears\s+INTEGER NOT NULL DEFAULT 0/);
    assert.ok(
      MIGRATE_SQL.includes('game_zone_progress ADD COLUMN IF NOT EXISTS clears INTEGER NOT NULL DEFAULT 0'),
    );
  });

  test('game_idle_state 两条路都建了，且 (character_id) 唯一、zone_id 非空', () => {
    const cols = tableColumns(INIT_SQL, 'game_idle_state');
    for (const c of ['character_id', 'zone_id', 'updated_at']) assert.ok(cols.has(c), `缺列 ${c}`);
    const block = INIT_SQL.match(/CREATE TABLE IF NOT EXISTS game_idle_state \(([\s\S]*?)\n\);/);
    assert.ok(block);
    assert.match(block[1], /character_id INTEGER NOT NULL UNIQUE/);
    assert.match(block[1], /zone_id\s+INTEGER NOT NULL/);
    assert.ok(MIGRATE_SQL.includes('CREATE TABLE IF NOT EXISTS game_idle_state'));
  });

  test('game_idle_state 与 game_zone_state 是两张表（互斥判定依赖这个分离）', () => {
    // 「在线战斗所在」与「离线挂机目标」必须是两处存储，否则打 A 挂 B 无法表达（§22 §5.3）
    assert.ok(tableColumns(INIT_SQL, 'game_zone_state').has('current_zone_id'));
    assert.ok(tableColumns(INIT_SQL, 'game_idle_state').has('zone_id'));
  });
});

describe('§22 Q1 章节与秘境解绑', () => {
  test('game_chapters.zone_code 放宽为可空（两条路）', () => {
    assert.match(INIT_SQL, /ALTER TABLE game_chapters ALTER COLUMN zone_code DROP NOT NULL/);
    assert.match(MIGRATE_SQL, /ALTER TABLE game_chapters ALTER COLUMN zone_code DROP NOT NULL/);
  });

  test('CREATE TABLE 里 game_chapters.zone_code 已不带 NOT NULL', () => {
    const line = INIT_SQL.match(/CREATE TABLE IF NOT EXISTS game_chapters \(([\s\S]*?)\n\);/);
    assert.ok(line);
    assert.match(line[1], /zone_code\s+VARCHAR\(50\),/);
    assert.ok(!/zone_code\s+VARCHAR\(50\) NOT NULL/.test(line[1]));
  });
});

describe('迁移脚本必须幂等（重复执行不得报错）', () => {
  test('每一条 ALTER TABLE 都是 IF NOT EXISTS 或 DROP NOT NULL 形态', () => {
    const alters = MIGRATE_SQL.match(/ALTER TABLE [^'`\n]+/g) ?? [];
    assert.ok(alters.length >= 6, `只找到 ${alters.length} 条 ALTER，迁移脚本疑似被改坏`);
    for (const stmt of alters) {
      const ok =
        stmt.includes('ADD COLUMN IF NOT EXISTS') ||
        stmt.includes('DROP NOT NULL');
      assert.ok(ok, `这条 ALTER 不幂等，重复执行会失败：${stmt.trim()}`);
    }
  });

  test('CREATE 语句都是 IF NOT EXISTS（含索引）', () => {
    const creates = MIGRATE_SQL.match(/CREATE (?:TABLE|INDEX) [^'`\n]+/g) ?? [];
    assert.ok(creates.length >= 3);
    for (const stmt of creates) {
      assert.ok(stmt.includes('IF NOT EXISTS'), `不幂等的 CREATE：${stmt.trim()}`);
    }
  });
});
