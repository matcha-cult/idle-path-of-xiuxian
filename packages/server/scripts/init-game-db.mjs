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

CREATE TABLE IF NOT EXISTS game_zones (
  id                      SERIAL PRIMARY KEY,
  code                    VARCHAR(50) NOT NULL UNIQUE,
  name                    VARCHAR(50) NOT NULL,
  chapter                 SMALLINT NOT NULL,
  order_index             INTEGER NOT NULL,
  min_realm               SMALLINT NOT NULL,
  unit_code               VARCHAR(50) NOT NULL,
  boss_code               VARCHAR(50),
  base_power              INTEGER NOT NULL,
  power_step              INTEGER NOT NULL,
  max_floor               SMALLINT NOT NULL,
  lingyun_bonus_per_floor INTEGER NOT NULL,
  boss_every_floors       SMALLINT NOT NULL DEFAULT 10,
  require_prev_best_floor INTEGER NOT NULL DEFAULT 0,
  tier_bonus_every_floors INTEGER NOT NULL DEFAULT 0,
  drop_bonus_every_floors INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_zones_order ON game_zones(order_index);
ALTER TABLE game_zones ADD COLUMN IF NOT EXISTS require_prev_best_floor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_zones ADD COLUMN IF NOT EXISTS tier_bonus_every_floors INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_zones ADD COLUMN IF NOT EXISTS drop_bonus_every_floors INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS game_zone_progress (
  id           SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL,
  zone_id      INTEGER NOT NULL,
  floor        INTEGER NOT NULL DEFAULT 1,
  best_floor   INTEGER NOT NULL DEFAULT 0,
  cleared      BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (character_id, zone_id)
);
CREATE INDEX IF NOT EXISTS idx_game_zone_progress_character ON game_zone_progress(character_id);

CREATE TABLE IF NOT EXISTS game_zone_state (
  id              SERIAL PRIMARY KEY,
  character_id    INTEGER NOT NULL UNIQUE,
  current_zone_id INTEGER NOT NULL,
  updated_at      TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_idle_counters (
  id             SERIAL PRIMARY KEY,
  character_id   INTEGER NOT NULL,
  day            DATE NOT NULL,
  items_produced INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (character_id, day)
);

-- ===== R2 地图层（settings-revision-2 §5 / §7）=====
-- 地图是「地点宿主」：节点可承载系统（feature_key），未实现的系统在 UI 上显示未开放，
-- 因此地图层的落地不被 炼丹/御兽/PVP 等未实现系统阻塞。
CREATE TABLE IF NOT EXISTS game_maps (
  id                SERIAL PRIMARY KEY,
  code              VARCHAR(50) NOT NULL UNIQUE,
  name              VARCHAR(50) NOT NULL,
  world             VARCHAR(20) NOT NULL DEFAULT 'great', -- great=大世界 / other=异界（§5.6 预留）
  order_index       INTEGER NOT NULL,
  chapter_from      SMALLINT NOT NULL,
  chapter_to        SMALLINT NOT NULL,
  requires_map_code VARCHAR(50),
  description       TEXT,
  grid_rows         SMALLINT NOT NULL DEFAULT 20, -- 坐标空间行数：交叉线索引 0..grid_rows（§14.1；21 条线 ⇒ 20）
  grid_cols         SMALLINT NOT NULL DEFAULT 20, -- 坐标空间列数：交叉线索引 0..grid_cols
  background_key    VARCHAR(100),                 -- 预留：底图资源 key（本轮恒为 NULL）
  created_at        TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- P1 画布增量列（幂等：老库补列；新库由上面的 CREATE 带上）
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS grid_rows SMALLINT NOT NULL DEFAULT 20;
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS grid_cols SMALLINT NOT NULL DEFAULT 20;
ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS background_key VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_game_maps_order ON game_maps(order_index);

CREATE TABLE IF NOT EXISTS game_map_nodes (
  id                 SERIAL PRIMARY KEY,
  code               VARCHAR(50) NOT NULL UNIQUE,
  map_id             INTEGER NOT NULL,
  name               VARCHAR(50) NOT NULL,
  ring               VARCHAR(20) NOT NULL, -- outer/approach/peaks/inner/summit
  sector             VARCHAR(4),           -- N/NE/E/SE/S/SW/W/NW（八峰按方位排布）
  kind               VARCHAR(20) NOT NULL, -- route/idle_spot/secret_realm/summit
  feature_key        VARCHAR(20),          -- skill/craft/quest/alchemy/beast/farm/pvp/discipline/waypoint/profession
  level              SMALLINT NOT NULL,    -- 怪物境界（固定，不随层数上涨）
  threshold          INTEGER NOT NULL,     -- 固定战力门槛（§6 确定性模型）
  has_waypoint       BOOLEAN NOT NULL DEFAULT FALSE,
  chapter            SMALLINT NOT NULL,
  requires_node_code VARCHAR(50),
  zone_code          VARCHAR(50),          -- kind=secret_realm 时指向 game_zones.code
  order_index        INTEGER NOT NULL,
  grid_row           SMALLINT NOT NULL,     -- 0-based 交叉线索引，0..grid_rows
  grid_col           SMALLINT NOT NULL,     -- 0-based 交叉线索引，0..grid_cols
  description        TEXT,                  -- 风味文案（悬停卡 / 右栏详情）
  created_at         TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- min_realm 与 unit_code 都曾被加进来，但设计里没有这两个字段：
--   min_realm：地图由剧情解锁（D4）、节点由 threshold 检定（§6），第三个境界闸门既是死字段、
--              又会挡住「装备够就允许越级打」的设计意图（§6.2 战力溢出本身就是追求）；
--   unit_code：挂机只能在「历练秘境峰」，而秘境的产出单位由 game_zones.unit_code 决定，
--              地图节点不需要自己的产出单位（用户修正：地图上不散布挂机点）。
ALTER TABLE game_maps DROP COLUMN IF EXISTS min_realm;
ALTER TABLE game_map_nodes DROP COLUMN IF EXISTS min_realm;
ALTER TABLE game_map_nodes DROP COLUMN IF EXISTS unit_code;
-- P1 画布增量列（幂等）。**先建可空列**：老库里的行还没有坐标，直接上 NOT NULL 会失败。
-- NOT NULL 由本脚本末尾「节点重灌之后」的收口步骤补上（见 promoteMapNodeGridNotNull）——
-- 放在建表处会有一个竞态：那一刻表里还是**上一轮的旧行**（无坐标），收口被跳过，
-- 于是新库/老库都会停在「可空」，而 schema.prisma 写的是 NOT NULL。
ALTER TABLE game_map_nodes ADD COLUMN IF NOT EXISTS grid_row SMALLINT;
ALTER TABLE game_map_nodes ADD COLUMN IF NOT EXISTS grid_col SMALLINT;
ALTER TABLE game_map_nodes ADD COLUMN IF NOT EXISTS description TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_map_nodes_grid
  ON game_map_nodes(map_id, grid_row, grid_col);
CREATE INDEX IF NOT EXISTS idx_game_map_nodes_map ON game_map_nodes(map_id, order_index);

CREATE TABLE IF NOT EXISTS game_map_edges (
  id            SERIAL PRIMARY KEY,
  map_id        INTEGER NOT NULL,
  from_node_id  INTEGER NOT NULL,
  to_node_id    INTEGER NOT NULL,
  bidirectional BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (map_id, from_node_id, to_node_id)
);
CREATE INDEX IF NOT EXISTS idx_game_map_edges_map ON game_map_edges(map_id);

-- 节点进度：visited=跑图到达；waypoint_unlocked=传送点已点亮；idle_unlocked=可离线挂机（D2）
CREATE TABLE IF NOT EXISTS game_node_progress (
  id                SERIAL PRIMARY KEY,
  character_id      INTEGER NOT NULL,
  node_id           INTEGER NOT NULL,
  visited           BOOLEAN NOT NULL DEFAULT FALSE,
  waypoint_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  idle_unlocked     BOOLEAN NOT NULL DEFAULT FALSE,
  cleared           BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at        TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (character_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_game_node_progress_character ON game_node_progress(character_id);

CREATE TABLE IF NOT EXISTS game_quest_defs (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(50) NOT NULL UNIQUE,
  chapter      SMALLINT NOT NULL,
  name         VARCHAR(100) NOT NULL,
  trigger_type VARCHAR(20) NOT NULL DEFAULT 'auto',
  trigger_cond TEXT,
  objectives   TEXT NOT NULL,
  rewards      TEXT NOT NULL,
  dialogues    TEXT,
  next_quest   VARCHAR(50),
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_quest_defs_order ON game_quest_defs(order_index);

CREATE TABLE IF NOT EXISTS game_quest_progress (
  id           SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL,
  quest_code   VARCHAR(50) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  objectives      TEXT,
  completed_at    TIMESTAMP(6),
  rewards_granted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (character_id, quest_code)
);
CREATE INDEX IF NOT EXISTS idx_game_quest_progress_character ON game_quest_progress(character_id);
ALTER TABLE game_quest_progress ADD COLUMN IF NOT EXISTS rewards_granted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS game_chapters (
  id               SERIAL PRIMARY KEY,
  code             VARCHAR(50) NOT NULL UNIQUE,
  chapter          SMALLINT NOT NULL,
  name             VARCHAR(100) NOT NULL,
  theme            VARCHAR(100),
  min_realm        SMALLINT NOT NULL,
  zone_code        VARCHAR(50) NOT NULL,
  quest_start_code VARCHAR(50) NOT NULL,
  quest_end_code   VARCHAR(50) NOT NULL,
  requires_chapter VARCHAR(50),
  rewards          TEXT NOT NULL,
  dialogues        TEXT,
  order_index      INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_chapters_order ON game_chapters(order_index);

CREATE TABLE IF NOT EXISTS game_chapter_progress (
  id              SERIAL PRIMARY KEY,
  character_id    INTEGER NOT NULL,
  chapter_id      INTEGER NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  rewards_granted BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at    TIMESTAMP(6),
  UNIQUE (character_id, chapter_id)
);
CREATE INDEX IF NOT EXISTS idx_game_chapter_progress_character ON game_chapter_progress(character_id);

CREATE TABLE IF NOT EXISTS game_stat_counters (
  id           SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL,
  key          VARCHAR(80) NOT NULL,
  value        BIGINT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (character_id, key)
);
CREATE INDEX IF NOT EXISTS idx_game_stat_counters_character ON game_stat_counters(character_id);

CREATE TABLE IF NOT EXISTS game_story_seen (
  id           SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL,
  node_key     VARCHAR(120) NOT NULL,
  seen_at      TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (character_id, node_key)
);
CREATE INDEX IF NOT EXISTS idx_game_story_seen_character ON game_story_seen(character_id);

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
  console.log('[放置·修仙之路] game tables ok (32 张表)');

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

  // ===== P5.1 秘境定义（重灌：进度 state/progress 为玩家数据，保留） =====
  const zones = await loadJson('zones.json');
  await client.query('DELETE FROM game_zones');
  for (const z of zones) {
    await client.query(
      'INSERT INTO game_zones (id, code, name, chapter, order_index, min_realm, unit_code, boss_code, base_power, power_step, max_floor, lingyun_bonus_per_floor, boss_every_floors, require_prev_best_floor, tier_bonus_every_floors, drop_bonus_every_floors) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id',
      [z.id, z.code, z.name, z.chapter, z.orderIndex, z.minRealm, z.unitCode, z.bossCode ?? null, z.basePower, z.powerStep, z.maxFloor, z.lingyunBonusPerFloor, z.bossEveryFloors ?? 10, z.requirePrevBestFloor ?? 0, z.tierBonusEveryFloors ?? 0, z.dropBonusEveryFloors ?? 0],
    );
  }
  await client.query("SELECT setval('game_zones_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_zones));");
  const orphanZoneUnits = await client.query(
    'SELECT COUNT(*)::int AS c FROM game_zones z LEFT JOIN game_unit_templates u ON u.code = z.unit_code WHERE u.code IS NULL',
  );
  if (Number(orphanZoneUnits.rows[0].c) > 0) {
    console.warn('[放置·修仙之路] 警告：' + orphanZoneUnits.rows[0].c + ' 个秘境引用不存在的单位');
  }
  const orphanProgress = await client.query(
    'SELECT COUNT(*)::int AS c FROM game_zone_progress p LEFT JOIN game_zones z ON z.id = p.zone_id WHERE z.id IS NULL',
  );
  const orphanState = await client.query(
    'SELECT COUNT(*)::int AS c FROM game_zone_state s LEFT JOIN game_zones z ON z.id = s.current_zone_id WHERE z.id IS NULL',
  );
  const orphanZoneRefs = Number(orphanProgress.rows[0].c) + Number(orphanState.rows[0].c);
  if (orphanZoneRefs > 0) {
    console.warn('[放置·修仙之路] 警告：' + orphanZoneRefs + ' 条秘境进度/当前秘境引用不存在的秘境（种子 id 漂移）');
  }
  console.log('[放置·修仙之路] zones: ' + zones.length);

  // ===== R2 地图层（重灌配置；game_node_progress 是玩家数据，保留）=====
  // 顺序：maps → nodes（引用 map_id / zone_id）→ edges（引用 node_id）。
  // 节点/边是纯配置，全量重灌；进度表不动，避免清掉玩家已点亮的传送点。
  const maps = await loadJson('maps.json');
  await client.query('DELETE FROM game_map_edges');
  await client.query('DELETE FROM game_map_nodes');
  await client.query('DELETE FROM game_maps');
  for (const m of maps) {
    await client.query(
      'INSERT INTO game_maps (id, code, name, world, order_index, chapter_from, chapter_to, requires_map_code, description, grid_rows, grid_cols, background_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, grid_rows=EXCLUDED.grid_rows, grid_cols=EXCLUDED.grid_cols, background_key=EXCLUDED.background_key RETURNING id',
      [m.id, m.code, m.name, m.world ?? 'great', m.orderIndex, m.chapterFrom, m.chapterTo, m.requiresMapCode ?? null, m.description ?? null, m.gridRows ?? 20, m.gridCols ?? 20, m.backgroundKey ?? null],
    );
  }
  await client.query("SELECT setval('game_maps_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_maps));");

  const mapIdByCode = new Map();
  for (const row of (await client.query('SELECT id, code FROM game_maps')).rows) {
    mapIdByCode.set(row.code, Number(row.id));
  }
  const zoneIdByCode = new Map();
  for (const row of (await client.query('SELECT id, code FROM game_zones')).rows) {
    zoneIdByCode.set(row.code, Number(row.id));
  }

  const mapNodes = await loadJson('map-nodes.json');
  const nodeIdByCode = new Map();
  for (const n of mapNodes) {
    const mapId = mapIdByCode.get(n.mapCode);
    if (mapId === undefined) throw new Error(`map-nodes.json 引用了未定义地图: ${n.mapCode}`);
    const zoneCode = n.zoneCode ?? null;
    if (zoneCode != null && !zoneIdByCode.has(zoneCode)) {
      throw new Error(`节点 ${n.code} 引用了未定义秘境: ${zoneCode}`);
    }
    const res = await client.query(
      'INSERT INTO game_map_nodes (code, map_id, name, ring, sector, kind, feature_key, level, threshold, has_waypoint, chapter, requires_node_code, zone_code, order_index, grid_row, grid_col, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, map_id=EXCLUDED.map_id, ring=EXCLUDED.ring, sector=EXCLUDED.sector, kind=EXCLUDED.kind, feature_key=EXCLUDED.feature_key, level=EXCLUDED.level, threshold=EXCLUDED.threshold, has_waypoint=EXCLUDED.has_waypoint, chapter=EXCLUDED.chapter, requires_node_code=EXCLUDED.requires_node_code, zone_code=EXCLUDED.zone_code, order_index=EXCLUDED.order_index, grid_row=EXCLUDED.grid_row, grid_col=EXCLUDED.grid_col, description=EXCLUDED.description RETURNING id',
      [n.code, mapId, n.name, n.ring, n.sector ?? null, n.kind, n.featureKey ?? null, n.level, n.threshold, n.hasWaypoint ?? false, n.chapter, n.requiresNodeCode ?? null, zoneCode, n.orderIndex, n.gridRow ?? null, n.gridCol ?? null, n.description ?? null],
    );
    nodeIdByCode.set(n.code, Number(res.rows[0].id));
  }
  await client.query("SELECT setval('game_map_nodes_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_map_nodes));");

  const mapEdges = await loadJson('map-edges.json');
  let edgeCount = 0;
  for (const e of mapEdges) {
    const mapId = mapIdByCode.get(e.mapCode);
    const fromId = nodeIdByCode.get(e.fromNodeCode);
    const toId = nodeIdByCode.get(e.toNodeCode);
    if (mapId === undefined || fromId === undefined || toId === undefined) {
      throw new Error(`map-edges.json 引用未定义对象: ${e.mapCode} ${e.fromNodeCode}→${e.toNodeCode}`);
    }
    await client.query(
      'INSERT INTO game_map_edges (map_id, from_node_id, to_node_id, bidirectional) VALUES ($1,$2,$3,$4) ON CONFLICT (map_id, from_node_id, to_node_id) DO UPDATE SET bidirectional=EXCLUDED.bidirectional',
      [mapId, fromId, toId, e.bidirectional ?? true],
    );
    edgeCount += 1;
  }

  // 自检：节点/边的悬空引用（种子 id 漂移或改名时立刻暴露，而不是等到玩家点进去）
  const orphanNodes = await client.query(
    'SELECT COUNT(*)::int AS c FROM game_map_nodes n LEFT JOIN game_maps m ON m.id = n.map_id WHERE m.id IS NULL',
  );
  const orphanRequires = await client.query(
    'SELECT COUNT(*)::int AS c FROM game_map_nodes n WHERE n.requires_node_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM game_map_nodes p WHERE p.code = n.requires_node_code)',
  );
  const orphanZones = await client.query(
    'SELECT COUNT(*)::int AS c FROM game_map_nodes n LEFT JOIN game_zones z ON z.code = n.zone_code WHERE n.zone_code IS NOT NULL AND z.id IS NULL',
  );
  // P1 画布：坐标必须齐全且在 0..grid_rows / 0..grid_cols 内（越界 = 枢纽画到画布外，玩家永远点不到）
  const badGrid = await client.query(
    `SELECT n.code, n.grid_row, n.grid_col, m.grid_rows, m.grid_cols
       FROM game_map_nodes n JOIN game_maps m ON m.id = n.map_id
      WHERE n.grid_row IS NULL OR n.grid_col IS NULL
         OR n.grid_row < 0 OR n.grid_row > m.grid_rows
         OR n.grid_col < 0 OR n.grid_col > m.grid_cols
      ORDER BY n.code`,
  );
  if (badGrid.rows.length > 0) {
    const list = badGrid.rows
      .map((r) => `${r.code}(${r.grid_row ?? 'null'},${r.grid_col ?? 'null'})`)
      .join(', ');
    throw new Error(`地图节点坐标缺失或越界（须落在 0..grid_rows / 0..grid_cols 内）：${list}`);
  }
  const orphanMapRefs = Number(orphanNodes.rows[0].c) + Number(orphanRequires.rows[0].c) + Number(orphanZones.rows[0].c);
  if (orphanMapRefs > 0) {
    throw new Error(`地图种子存在 ${orphanMapRefs} 处悬空引用（map/requires/zone）`);
  }
  // P1 画布收口：节点已按种子重灌（坐标齐全且已校验），此刻才把 grid_row/grid_col 提升为 NOT NULL。
  // 放在建表处是错的：那一刻表里还是上一轮的旧行（无坐标），提升会被跳过且**永远不再重试**。
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM game_map_nodes WHERE grid_row IS NULL OR grid_col IS NULL) THEN
        ALTER TABLE game_map_nodes ALTER COLUMN grid_row SET NOT NULL;
        ALTER TABLE game_map_nodes ALTER COLUMN grid_col SET NOT NULL;
      END IF;
    END $$;
  `);
  console.log('[放置·修仙之路] maps: ' + maps.length + ' / nodes: ' + mapNodes.length + ' / edges: ' + edgeCount);

  // ===== P6 任务定义（重灌：任务进度为玩家数据，保留） =====
  const questDefs = await loadJson('quest-defs.json');
  await client.query('DELETE FROM game_quest_defs');
  for (const q of questDefs) {
    await client.query(
      'INSERT INTO game_quest_defs (id, code, chapter, name, trigger_type, trigger_cond, objectives, rewards, dialogues, next_quest, order_index) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id',
      [q.id, q.code, q.chapter, q.name, q.triggerType ?? 'auto', jstr(q.trigger ?? {}), jstr(q.objectives ?? []), jstr(q.rewards ?? {}), jstr(q.dialogues ?? null), q.nextQuest ?? null, q.orderIndex ?? 0],
    );
  }
  await client.query("SELECT setval('game_quest_defs_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_quest_defs));");
  const questCodes = new Set(questDefs.map((q) => q.code));
  let badQuestRefs = 0;
  for (const q of questDefs) {
    const reqs = (q.trigger && q.trigger.requires) || [];
    for (const req of reqs) {
      if (!questCodes.has(req)) {
        console.warn('[放置·修仙之路] 警告：任务 ' + q.code + ' 前置引用未知任务 ' + req);
        badQuestRefs++;
      }
    }
    if (q.nextQuest && !questCodes.has(q.nextQuest)) {
      console.warn('[放置·修仙之路] 警告：任务 ' + q.code + ' 后续引用未知任务 ' + q.nextQuest);
      badQuestRefs++;
    }
  }
  const orphanQuestProgress = await client.query(
    'SELECT COUNT(*)::int AS c FROM game_quest_progress p LEFT JOIN game_quest_defs d ON d.code = p.quest_code WHERE d.code IS NULL',
  );
  if (Number(orphanQuestProgress.rows[0].c) > 0) {
    console.warn('[放置·修仙之路] 警告：' + orphanQuestProgress.rows[0].c + ' 条任务进度引用不存在的任务');
  }
  console.log('[放置·修仙之路] quest defs: ' + questDefs.length + (badQuestRefs > 0 ? ' / 引用告警 ' + badQuestRefs : ''));

  // ===== P7 章节定义（重灌：章节进度为玩家数据，保留） =====
  const chapterDefs = await loadJson('chapters.json');
  await client.query('DELETE FROM game_chapters');
  for (const c of chapterDefs) {
    await client.query(
      'INSERT INTO game_chapters (id, code, chapter, name, theme, min_realm, zone_code, quest_start_code, quest_end_code, requires_chapter, rewards, dialogues, order_index) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id',
      [c.id, c.code, c.chapter, c.name, c.theme ?? null, c.minRealm, c.zoneCode, c.questStartCode, c.questEndCode, c.requiresChapter ?? null, jstr(c.rewards ?? {}), jstr(c.dialogues ?? null), c.orderIndex ?? 0],
    );
  }
  await client.query("SELECT setval('game_chapters_id_seq', (SELECT COALESCE(MAX(id),1) FROM game_chapters));");
  const chapterCodes = new Set(chapterDefs.map((c) => c.code));
  const questCodeSet = new Set(questDefs.map((q) => q.code));
  let badChapterRefs = 0;
  for (const c of chapterDefs) {
    if (c.requiresChapter && !chapterCodes.has(c.requiresChapter)) {
      console.warn('[放置·修仙之路] 警告：章节 ' + c.code + ' 前置引用未知章节 ' + c.requiresChapter);
      badChapterRefs++;
    }
    if (!questCodeSet.has(c.questStartCode) || !questCodeSet.has(c.questEndCode)) {
      console.warn('[放置·修仙之路] 警告：章节 ' + c.code + ' 引用未知任务');
      badChapterRefs++;
    }
  }
  const orphanChapterProgress = await client.query(
    'SELECT COUNT(*)::int AS c FROM game_chapter_progress p LEFT JOIN game_chapters c ON c.id = p.chapter_id WHERE c.id IS NULL',
  );
  if (Number(orphanChapterProgress.rows[0].c) > 0) {
    console.warn('[放置·修仙之路] 警告：' + orphanChapterProgress.rows[0].c + ' 条章节进度引用不存在的章节');
  }
  console.log('[放置·修仙之路] chapters: ' + chapterDefs.length + (badChapterRefs > 0 ? ' / 引用告警 ' + badChapterRefs : ''));

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
