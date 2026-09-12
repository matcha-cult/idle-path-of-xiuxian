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

-- P3.2 增量列（幂等）
ALTER TABLE game_items ADD COLUMN IF NOT EXISTS base_stats TEXT;
ALTER TABLE game_items ADD COLUMN IF NOT EXISTS mirrored BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE game_items ADD COLUMN IF NOT EXISTS vaaled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS game_equipment (
  id           SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL UNIQUE,
  slots        TEXT NOT NULL,
  updated_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_skills (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(50) NOT NULL,
  skill_type  VARCHAR(10) NOT NULL,
  daoji       VARCHAR(20) NOT NULL,
  school      VARCHAR(10) NOT NULL,
  spirit_cost SMALLINT NOT NULL DEFAULT 0,
  effects     TEXT NOT NULL,
  growth_rate DOUBLE PRECISION NOT NULL DEFAULT 0.05,
  description VARCHAR(255),
  created_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_skills_type ON game_skills(skill_type);

CREATE TABLE IF NOT EXISTS game_learned_skills (
  id           SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL,
  skill_id     INTEGER NOT NULL,
  level        INTEGER NOT NULL DEFAULT 1,
  learned_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (character_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_game_learned_skills_character ON game_learned_skills(character_id);

CREATE TABLE IF NOT EXISTS game_skill_panels (
  id           SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL UNIQUE,
  slots        TEXT NOT NULL,
  updated_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_currencies (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(20) NOT NULL UNIQUE,
  name        VARCHAR(50) NOT NULL,
  description VARCHAR(255),
  implemented BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_wallets (
  id            SERIAL PRIMARY KEY,
  character_id  INTEGER NOT NULL,
  currency_code VARCHAR(20) NOT NULL,
  amount        BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (character_id, currency_code)
);
CREATE INDEX IF NOT EXISTS idx_game_wallets_character ON game_wallets(character_id);

CREATE TABLE IF NOT EXISTS game_essences (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(20) NOT NULL UNIQUE,
  name          VARCHAR(50) NOT NULL,
  polarity      VARCHAR(10) NOT NULL,
  target_family VARCHAR(30) NOT NULL,
  description   VARCHAR(255),
  created_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_essence_inventory (
  id           SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL,
  essence_id   INTEGER NOT NULL,
  count        BIGINT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (character_id, essence_id)
);
CREATE INDEX IF NOT EXISTS idx_game_essence_inventory_character ON game_essence_inventory(character_id);

CREATE TABLE IF NOT EXISTS game_unit_hidden_affixes (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(50) NOT NULL UNIQUE,
  name       VARCHAR(50) NOT NULL,
  effects    TEXT NOT NULL,
  weight     INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_unit_templates (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(50) NOT NULL UNIQUE,
  name           VARCHAR(50) NOT NULL,
  realm          SMALLINT NOT NULL,
  camp           VARCHAR(10) NOT NULL,
  gives_lingyun  BOOLEAN NOT NULL DEFAULT TRUE,
  base_stats     TEXT,
  drop_table_ref INTEGER,
  created_at     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_unit_templates_realm ON game_unit_templates(realm);
CREATE INDEX IF NOT EXISTS idx_game_unit_templates_camp ON game_unit_templates(camp);

CREATE TABLE IF NOT EXISTS game_unit_hidden_pools (
  id               SERIAL PRIMARY KEY,
  unit_template_id INTEGER NOT NULL,
  hidden_affix_id  INTEGER NOT NULL,
  UNIQUE (unit_template_id, hidden_affix_id)
);
CREATE INDEX IF NOT EXISTS idx_game_unit_hidden_pools_unit ON game_unit_hidden_pools(unit_template_id);

CREATE TABLE IF NOT EXISTS game_drop_tables (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(50) NOT NULL UNIQUE,
  name           VARCHAR(50) NOT NULL,
  drops_per_kill SMALLINT NOT NULL DEFAULT 1,
  tier_offset    SMALLINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_drop_entries (
  id            SERIAL PRIMARY KEY,
  drop_table_id INTEGER NOT NULL,
  kind          VARCHAR(20) NOT NULL,
  base_id       INTEGER,
  base_tier     SMALLINT,
  rarity        SMALLINT,
  currency_code VARCHAR(20),
  essence_code  VARCHAR(20),
  min_count     INTEGER NOT NULL DEFAULT 1,
  max_count     INTEGER NOT NULL DEFAULT 1,
  weight        INTEGER NOT NULL DEFAULT 100
);
CREATE INDEX IF NOT EXISTS idx_game_drop_entries_table ON game_drop_entries(drop_table_id);

CREATE TABLE IF NOT EXISTS game_idle_counters (
  id             SERIAL PRIMARY KEY,
  character_id   INTEGER NOT NULL,
  day            DATE NOT NULL,
  items_produced INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (character_id, day)
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
  console.log('[放置·修仙之路] game tables ok (19 张表)');

  // ===== 重灌配置种子（幂等） =====
  // 基底/词缀/池为纯配置表，全量重灌（种子带显式 id，重灌不改变存量引用关系）；
  // 拾取规则仅重建系统预置模板（character_id=0），保留玩家自建行。
  await client.query('DELETE FROM game_base_affix_pools');
  await client.query('DELETE FROM game_affixes');
  await client.query('DELETE FROM game_item_bases');
  await client.query('DELETE FROM game_pickup_rules WHERE character_id = 0');

  // ===== 物品基底 =====
  const bases = await loadJson('item-bases.json');
  const baseIdByCode = new Map();
  for (const b of bases) {
    const r = await client.query(
      `INSERT INTO game_item_bases (id, code, name, category, slot, sub_type, tier, base_stats, implicit_affixes, unique_affixes, rarity_limit, drop_weight)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [b.id, b.code, b.name, b.category, b.slot ?? null, b.subType ?? null, b.tier,
       jstr(b.baseStats), jstr(b.implicitAffixes), jstr(b.uniqueAffixes), b.rarityLimit ?? 2, b.dropWeight ?? 100],
    );
    baseIdByCode.set(b.code, Number(r.rows[0].id));
  }
  // 校准自增序列（显式 id 之后继续递增）
  await client.query("SELECT setval('game_item_bases_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_item_bases));");
  console.log(`[放置·修仙之路] item bases: ${bases.length}`);

  // ===== 词缀 =====
  const affixes = await loadJson('affixes.json');
  const affixIdByCode = new Map();
  for (const a of affixes) {
    const r = await client.query(
      `INSERT INTO game_affixes (id, code, name, polarity, tier, effects, value_func, weight, is_fractured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [a.id, a.code, a.name, a.polarity, a.tier, jstr(a.effects ?? {}), jstr(a.valueFunc ?? null), a.weight ?? 0, Boolean(a.isFractured)],
    );
    affixIdByCode.set(a.code, Number(r.rows[0].id));
  }
  await client.query("SELECT setval('game_affixes_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_affixes));");
  console.log(`[放置·修仙之路] affixes: ${affixes.length}`);

  // ===== 功法定义（重灌：learned/panels 为玩家数据，保留） =====
  const skills = await loadJson('skills.json');
  await client.query('DELETE FROM game_skills');
  for (const s of skills) {
    await client.query(
      `INSERT INTO game_skills (id, code, name, skill_type, daoji, school, spirit_cost, effects, growth_rate, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [s.id, s.code, s.name, s.skillType, s.daoji, s.school, s.spiritCost ?? 0,
       jstr(s.effects ?? {}), s.growthRate ?? 0.05, s.description ?? null],
    );
  }
  await client.query("SELECT setval('game_skills_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_skills));");
  const orphanLearned = await client.query(
    `SELECT COUNT(*)::int AS c FROM game_learned_skills l
     LEFT JOIN game_skills s ON s.id = l.skill_id WHERE s.id IS NULL`,
  );
  if (Number(orphanLearned.rows[0].c) > 0) {
    console.warn(
      `[放置·修仙之路] 警告：${orphanLearned.rows[0].c} 条已修习记录引用不存在的功法（种子 id 漂移）`,
    );
  }
  console.log(`[放置·修仙之路] skills: ${skills.length}`);

  // ===== 通货定义（重灌：钱包为玩家数据保留） =====
  const currencies = await loadJson('currencies.json');
  await client.query('DELETE FROM game_currencies');
  for (const c of currencies) {
    await client.query(
      `INSERT INTO game_currencies (id, code, name, description, implemented)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [c.id, c.code, c.name, c.description ?? null, Boolean(c.implemented)],
    );
  }
  await client.query("SELECT setval('game_currencies_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_currencies));");
  const orphanWallets = await client.query(
    `SELECT COUNT(*)::int AS c FROM game_wallets w
     LEFT JOIN game_currencies cc ON cc.code = w.currency_code WHERE cc.code IS NULL`,
  );
  if (Number(orphanWallets.rows[0].c) > 0) {
    console.warn(
      `[放置·修仙之路] 警告：${orphanWallets.rows[0].c} 条钱包记录引用未知通货代码`,
    );
  }
  console.log(`[放置·修仙之路] currencies: ${currencies.length}`);

  // ===== 精华定义（重灌：存量保留） =====
  const essences = await loadJson('essences.json');
  await client.query('DELETE FROM game_essences');
  for (const e of essences) {
    await client.query(
      `INSERT INTO game_essences (id, code, name, polarity, target_family, description)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [e.id, e.code, e.name, e.polarity, e.targetFamily, e.description ?? null],
    );
  }
  await client.query("SELECT setval('game_essences_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_essences));");
  const orphanEss = await client.query(
    `SELECT COUNT(*)::int AS c FROM game_essence_inventory i
     LEFT JOIN game_essences e ON e.id = i.essence_id WHERE e.id IS NULL`,
  );
  if (Number(orphanEss.rows[0].c) > 0) {
    console.warn(`[放置·修仙之路] 警告：${orphanEss.rows[0].c} 条精华存量引用不存在的精华`);
  }
  console.log(`[放置·修仙之路] essences: ${essences.length}`);

  // ===== P4 单位与掉落（隐藏词条 / 掉落表 / 单位模板） =====
  const hiddenAffixes = await loadJson('unit-hidden-affixes.json');
  await client.query('DELETE FROM game_unit_hidden_pools');
  await client.query('DELETE FROM game_unit_hidden_affixes');
  const hiddenIdByCode = new Map();
  for (const h of hiddenAffixes) {
    const r = await client.query(
      'INSERT INTO game_unit_hidden_affixes (id, code, name, effects, weight) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id',
      [h.id, h.code, h.name, jstr(h.effects ?? {}), h.weight ?? 100],
    );
    hiddenIdByCode.set(h.code, Number(r.rows[0].id));
  }
  await client.query("SELECT setval('game_unit_hidden_affixes_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_unit_hidden_affixes));");
  console.log('[放置·修仙之路] unit hidden affixes: ' + hiddenAffixes.length);

  const dropTables = await loadJson('drop-tables.json');
  await client.query('DELETE FROM game_drop_entries');
  await client.query('DELETE FROM game_drop_tables');
  const dropTableIdByCode = new Map();
  for (const t of dropTables) {
    const r = await client.query(
      'INSERT INTO game_drop_tables (id, code, name, drops_per_kill, tier_offset) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id',
      [t.id, t.code, t.name, t.dropsPerKill ?? 1, t.tierOffset ?? 0],
    );
    const tableId = Number(r.rows[0].id);
    dropTableIdByCode.set(t.code, tableId);
    for (const e of t.entries ?? []) {
      await client.query(
        'INSERT INTO game_drop_entries (drop_table_id, kind, base_id, base_tier, rarity, currency_code, essence_code, min_count, max_count, weight) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [tableId, e.kind, e.baseId ?? null, e.baseTier ?? null, e.rarity ?? null, e.currencyCode ?? null, e.essenceCode ?? null, e.minCount ?? 1, e.maxCount ?? 1, e.weight ?? 100],
      );
    }
  }
  await client.query("SELECT setval('game_drop_tables_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_drop_tables));");
  await client.query("SELECT setval('game_drop_entries_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_drop_entries));");
  const dropEntryCount = dropTables.reduce((sum, t) => sum + (t.entries ? t.entries.length : 0), 0);
  console.log('[放置·修仙之路] drop tables: ' + dropTables.length + ' / entries ' + dropEntryCount);

  const units = await loadJson('unit-templates.json');
  await client.query('DELETE FROM game_unit_hidden_pools');
  await client.query('DELETE FROM game_unit_templates');
  const unitIdByCode = new Map();
  let poolLinks = 0;
  for (const u of units) {
    let dropRef = null;
    if (u.dropTable) {
      dropRef = dropTableIdByCode.get(u.dropTable) ?? null;
      if (dropRef == null) console.warn('[放置·修仙之路] 警告：单位 ' + u.code + ' 引用未知掉落表 ' + u.dropTable);
    }
    const r = await client.query(
      'INSERT INTO game_unit_templates (id, code, name, realm, camp, gives_lingyun, base_stats, drop_table_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id',
      [u.id, u.code, u.name, u.realm, u.camp, Boolean(u.givesLingyun), jstr(u.baseStats), dropRef],
    );
    const unitId = Number(r.rows[0].id);
    unitIdByCode.set(u.code, unitId);
    for (const code of u.hiddenPool ?? []) {
      const hid = hiddenIdByCode.get(code);
      if (!hid) {
        console.warn('[放置·修仙之路] 警告：单位 ' + u.code + ' 引用未知隐藏词条 ' + code);
        continue;
      }
      await client.query(
        'INSERT INTO game_unit_hidden_pools (unit_template_id, hidden_affix_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [unitId, hid],
      );
      poolLinks++;
    }
  }
  await client.query("SELECT setval('game_unit_templates_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_unit_templates));");
  const orphanUnits = await client.query(
    'SELECT COUNT(*)::int AS c FROM game_unit_templates t LEFT JOIN game_drop_tables d ON d.id = t.drop_table_ref WHERE t.drop_table_ref IS NOT NULL AND d.id IS NULL',
  );
  if (Number(orphanUnits.rows[0].c) > 0) {
    console.warn('[放置·修仙之路] 警告：' + orphanUnits.rows[0].c + ' 个单位引用不存在的掉落表');
  }
  console.log('[放置·修仙之路] unit templates: ' + units.length + ' / hidden pool links ' + poolLinks);

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
  await client.query("SELECT setval('game_base_affix_pools_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_base_affix_pools));");

  // ===== 拾取规则（仅重建系统预置模板 character_id=0） =====
  const rules = await loadJson('pickup-rules.json');
  for (const r0 of rules) {
    await client.query(
      `INSERT INTO game_pickup_rules (character_id, name, rarity_min, tier_min, affix_codes, action, enabled, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING`,
      [r0.characterId ?? 0, r0.name, r0.rarityMin ?? 0, r0.tierMin ?? 1,
       jstr(r0.affixCodes ?? []), r0.action ?? 'keep', Boolean(r0.enabled), r0.priority ?? 100],
    );
  }
  console.log(`[放置·修仙之路] pickup rules: ${rules.length} 预置模板`);

  // ===== 一致性校验：存量物品引用的基底是否存在（防种子 id 漂移） =====
  const orphanBases = await client.query(
    `SELECT COUNT(*)::int AS c FROM game_items i
     LEFT JOIN game_item_bases b ON b.id = i.base_id
     WHERE b.id IS NULL`,
  );
  const orphanItems = Number(orphanBases.rows[0].c);
  if (orphanItems > 0) {
    console.warn(
      `[放置·修仙之路] 警告：${orphanItems} 件存量物品的 base_id 与种子失配（种子 id 可能漂移，请检查）`,
    );
  }

  console.log('[放置·修仙之路] game database initialized');
} finally {
  await client.end();
}
