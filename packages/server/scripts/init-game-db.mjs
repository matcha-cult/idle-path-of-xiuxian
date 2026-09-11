/**
 * 初始化 Game 系统数据库（建表 + 种子数据）
 *
 * 运行：pnpm --filter ./packages/server db:init:game
 *
 * 说明：
 * - 连接串走 env：DATABASE_URL（统一库 idle_game，与用户系统同库）
 * - 建表 DDL 与 prisma/schema.prisma（合并后的设计工件）对齐
 * - 种子数据来自 prisma/seeds/game/*.json
 * - 配置类表（基底/词缀/池/拾取规则）幂等重灌；游戏物品实例（game_items）不清理
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsDir = path.join(__dirname, '..', 'prisma', 'seeds', 'game');

const connectionString =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.DB_USER ?? 'postgres'}:${process.env.DB_PASSWORD ?? 'postgres'}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5432'}/${process.env.DB_NAME ?? 'idle_game'}?schema=public`;

const client = new pg.Client({ connectionString });

const ddl = `
CREATE TABLE IF NOT EXISTS game_item_bases (
  id               SERIAL PRIMARY KEY,
  code             VARCHAR(50) NOT NULL UNIQUE,
  name             VARCHAR(50) NOT NULL,
  category         VARCHAR(30) NOT NULL,
  slot             VARCHAR(20),
  sub_type         VARCHAR(30),
  tier             SMALLINT NOT NULL,
  base_stats       TEXT,
  implicit_affixes TEXT,
  unique_affixes   TEXT,
  rarity_limit     SMALLINT NOT NULL DEFAULT 2,
  drop_weight      INTEGER NOT NULL DEFAULT 100,
  icon             VARCHAR(100),
  created_at       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_item_bases_category ON game_item_bases(category);
CREATE INDEX IF NOT EXISTS idx_game_item_bases_tier ON game_item_bases(tier);

CREATE TABLE IF NOT EXISTS game_affixes (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(50) NOT NULL UNIQUE,
  name         VARCHAR(50) NOT NULL,
  polarity     VARCHAR(10) NOT NULL,
  tier         SMALLINT NOT NULL,
  effects      TEXT NOT NULL,
  value_func   TEXT,
  weight       INTEGER NOT NULL DEFAULT 100,
  is_fractured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_affixes_polarity_tier ON game_affixes(polarity, tier);

CREATE TABLE IF NOT EXISTS game_base_affix_pools (
  id        SERIAL PRIMARY KEY,
  base_id   INTEGER NOT NULL,
  affix_id  INTEGER NOT NULL,
  polarity  VARCHAR(10) NOT NULL,
  UNIQUE (base_id, affix_id)
);
CREATE INDEX IF NOT EXISTS idx_game_base_affix_pools_base ON game_base_affix_pools(base_id, polarity);

CREATE TABLE IF NOT EXISTS game_items (
  id           BIGSERIAL PRIMARY KEY,
  character_id INTEGER,
  base_id      INTEGER NOT NULL,
  rarity       SMALLINT NOT NULL DEFAULT 0,
  tier         SMALLINT NOT NULL,
  quality      SMALLINT NOT NULL DEFAULT 0,
  affixes      TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'bag',
  created_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_items_character_status ON game_items(character_id, status);
CREATE INDEX IF NOT EXISTS idx_game_items_base ON game_items(base_id);

CREATE TABLE IF NOT EXISTS game_equipment (
  id           SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL UNIQUE,
  slots        TEXT NOT NULL,
  updated_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_pickup_rules (
  id           SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL,
  name         VARCHAR(50) NOT NULL,
  rarity_min   SMALLINT NOT NULL DEFAULT 0,
  tier_min     SMALLINT NOT NULL DEFAULT 1,
  affix_codes  TEXT,
  action       VARCHAR(20) NOT NULL DEFAULT 'keep',
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  priority     INTEGER NOT NULL DEFAULT 100,
  created_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_pickup_rules_character ON game_pickup_rules(character_id);
`;

async function loadJson(name) {
  const raw = await readFile(path.join(seedsDir, name), 'utf8');
  return JSON.parse(raw);
}

function jstr(value) {
  return value == null ? null : JSON.stringify(value);
}

try {
  await client.connect();
  await client.query(ddl);
  console.log('[放置·修仙之路] game tables ok (6 张表)');

  // ===== 重灌配置种子（幂等：先清配置表） =====
  await client.query('DELETE FROM game_base_affix_pools');
  await client.query('DELETE FROM game_affixes');
  await client.query('DELETE FROM game_item_bases');
  await client.query('DELETE FROM game_pickup_rules');
  // 重置自增序列
  await client.query("ALTER SEQUENCE IF EXISTS game_item_bases_id_seq RESTART WITH 1");
  await client.query("ALTER SEQUENCE IF EXISTS game_affixes_id_seq RESTART WITH 1");
  await client.query("ALTER SEQUENCE IF EXISTS game_base_affix_pools_id_seq RESTART WITH 1");
  await client.query("ALTER SEQUENCE IF EXISTS game_pickup_rules_id_seq RESTART WITH 1");

  // ===== 物品基底 =====
  const bases = await loadJson('item-bases.json');
  const baseIdByCode = new Map();
  for (const b of bases) {
    const r = await client.query(
      `INSERT INTO game_item_bases (code, name, category, slot, sub_type, tier, base_stats, implicit_affixes, unique_affixes, rarity_limit, drop_weight)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [b.code, b.name, b.category, b.slot ?? null, b.subType ?? null, b.tier,
       jstr(b.baseStats), jstr(b.implicitAffixes), jstr(b.uniqueAffixes), b.rarityLimit ?? 2, b.dropWeight ?? 100],
    );
    baseIdByCode.set(b.code, Number(r.rows[0].id));
  }
  console.log(`[放置·修仙之路] item bases: ${bases.length}`);

  // ===== 词缀 =====
  const affixes = await loadJson('affixes.json');
  const affixIdByCode = new Map();
  for (const a of affixes) {
    const r = await client.query(
      `INSERT INTO game_affixes (code, name, polarity, tier, effects, value_func, weight, is_fractured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [a.code, a.name, a.polarity, a.tier, jstr(a.effects ?? {}), jstr(a.valueFunc ?? null), a.weight ?? 0, Boolean(a.isFractured)],
    );
    affixIdByCode.set(a.code, Number(r.rows[0].id));
  }
  console.log(`[放置·修仙之路] affixes: ${affixes.length}`);

  // ===== 底材词缀池（族 → 14 阶展开） =====
  const poolSeed = await loadJson('base-affix-pools.json');
  let poolCount = 0;
  for (const b of bases) {
    const group = poolSeed.groups.find((g) => g.categories.includes(b.category));
    if (!group) continue;
    for (const family of [...group.prefix, ...group.suffix]) {
      const polarity = group.prefix.includes(family) ? 'prefix' : 'suffix';
      for (let t = 1; t <= 14; t++) {
        const affixId = affixIdByCode.get(`${family}_${t}`);
        if (!affixId) continue;
        await client.query(
          'INSERT INTO game_base_affix_pools (base_id, affix_id, polarity) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [baseIdByCode.get(b.code), affixId, polarity],
        );
        poolCount++;
      }
    }
  }
  // 传奇基底额外固定词缀
  for (const e of poolSeed.extra ?? []) {
    const baseId = baseIdByCode.get(e.baseCode);
    if (!baseId) continue;
    for (const code of e.familyCodes) {
      const affixId = affixIdByCode.get(code);
      if (!affixId) continue;
      await client.query(
        'INSERT INTO game_base_affix_pools (base_id, affix_id, polarity) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [baseId, affixId, e.polarity],
      );
      poolCount++;
    }
  }
  console.log(`[放置·修仙之路] base-affix pools: ${poolCount}`);

  // ===== 拾取规则（系统预置模板） =====
  const rules = await loadJson('pickup-rules.json');
  for (const r0 of rules) {
    await client.query(
      `INSERT INTO game_pickup_rules (character_id, name, rarity_min, tier_min, affix_codes, action, enabled, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [r0.characterId ?? 0, r0.name, r0.rarityMin ?? 0, r0.tierMin ?? 1,
       jstr(r0.affixCodes ?? []), r0.action ?? 'keep', Boolean(r0.enabled), r0.priority ?? 100],
    );
  }
  console.log(`[放置·修仙之路] pickup rules: ${rules.length}`);

  console.log('[放置·修仙之路] game database initialized');
} finally {
  await client.end();
}
