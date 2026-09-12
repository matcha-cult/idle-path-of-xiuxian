/**
 * 应用配置文件加载器
 *
 * 配置文件：packages/server/config/app.config.json
 * - 相对包根解析（src 与 dist 同深度），不依赖 cwd
 * - 读取失败/字段非法 → 回退默认值并告警
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export interface UnitRealmBaseEntry {
  base: number;
  growth: number;
}

export type LootFallbackAction = 'keep' | 'salvage' | 'sell' | 'discard';

/** 秘境战力权重（P5.1） */
export interface ZonePowerConfig {
  realmWeight: number;
  equipWeight: number;
  skillDivisor: number;
}

export interface AppConfig {
  /** 单账户最大角色数 */
  maxCharactersPerAccount: number;
  /** 开发工具接口（物品生成/灵韵注入/玉简发放）单账户每分钟调用上限 */
  devToolRateLimitPerMinute: number;
  /** 辅心法共享神识总预算 */
  spiritBudget: number;
  /** 功法参悟等级上限 */
  maxSkillLevel: number;
  /** 参悟基础消耗（总消耗 = enlightenBaseCost × 当前等级） */
  enlightenBaseCost: number;
  /** 主心法道基一致的术法协同加成（占位展示，% 数值） */
  synergyBonusPct: number;
  /** 境界突破消耗表：index = 当前境界 → 升下一境消耗（0 占位，14 封顶无下一境） */
  realmBreakthroughCosts: number[];
  /** 境界模板基础属性：value = round(base × growth^(realm−1))（P4 单位系统） */
  unitRealmBase: Record<'hp' | 'atk' | 'def' | 'spiritPower' | 'lingyun', UnitRealmBaseEntry>;
  /** 单位实例化 roll 的隐藏词条条数区间 [min, max]（P4） */
  unitHiddenAffixCount: [number, number];
  /** 辨宝法阵无规则命中时的回退动作（P4） */
  lootFallbackAction: LootFallbackAction;
  /** 分解返还灵韵：tier × perTier × (rarity+1)（P4） */
  lootSalvageLingyunPerTier: number;
  /** 出售返还灵石：tier × perTier × (rarity+1)（P4） */
  lootSellSpiritStonesPerTier: number;
  /** 单次击杀结算的最大击杀数（P4 dev 接口） */
  maxKillsPerRequest: number;
  /** 离线收益：每小时结算轮数（P4.2） */
  idleRoundsPerHour: number;
  /** 离线收益：效率百分比（设计 §9.2 = 60）（P4.2） */
  idleEfficiencyPct: number;
  /** 离线收益：可累计的离线上限小时（设计 §9.2 = 12）（P4.2） */
  idleMaxOfflineHours: number;
  /** 离线收益：每日物品产出上限件数（设计 §9.2 = 200）（P4.2） */
  idleDailyItemCap: number;
  /** 秘境战力权重：realm×realmWeight + 装备数×equipWeight + floor(功法等级和/skillDivisor)（P5.1） */
  zonePower: ZonePowerConfig;
  /** 秘境 Boss 层额外掉落判定次数（P5.2） */
  zoneBossExtraDraws: number;
}

const DEFAULT_CONFIG: AppConfig = {
  maxCharactersPerAccount: 1,
  devToolRateLimitPerMinute: 5,
  spiritBudget: 100,
  maxSkillLevel: 20,
  enlightenBaseCost: 100,
  synergyBonusPct: 20,
  realmBreakthroughCosts: [0, 200, 800, 1800, 3200, 5000, 7200, 9800, 12800, 16200, 20000, 24200, 28800, 33800],
  unitRealmBase: {
    hp: { base: 60, growth: 1.45 },
    atk: { base: 8, growth: 1.38 },
    def: { base: 4, growth: 1.38 },
    spiritPower: { base: 5, growth: 1.38 },
    lingyun: { base: 5, growth: 1.5 },
  },
  unitHiddenAffixCount: [1, 3],
  lootFallbackAction: 'salvage',
  lootSalvageLingyunPerTier: 2,
  lootSellSpiritStonesPerTier: 10,
  maxKillsPerRequest: 50,
  idleRoundsPerHour: 60,
  idleEfficiencyPct: 60,
  idleMaxOfflineHours: 12,
  idleDailyItemCap: 200,
  zonePower: { realmWeight: 20, equipWeight: 5, skillDivisor: 2 },
  zoneBossExtraDraws: 2,
};

function sanitizeInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

/** 境界消耗表：需 int[] 且长度 ≥14，否则回退默认（递增公式预设 200×n²） */
function sanitizeCosts(value: unknown): number[] {
  if (!Array.isArray(value) || value.length < 14) return DEFAULT_CONFIG.realmBreakthroughCosts;
  const nums = value.map((v) => Math.floor(Number(v)));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return DEFAULT_CONFIG.realmBreakthroughCosts;
  return nums.slice(0, 15);
}

const REALM_BASE_KEYS = ['hp', 'atk', 'def', 'spiritPower', 'lingyun'] as const;

/** 境界模板：5 个属性各自 {base>0, growth>=1}，任一非法 → 整体回退 */
function sanitizeRealmBase(value: unknown): AppConfig['unitRealmBase'] {
  if (value == null || typeof value !== 'object') return DEFAULT_CONFIG.unitRealmBase;
  const out = {} as AppConfig['unitRealmBase'];
  const src = value as Record<string, unknown>;
  for (const key of REALM_BASE_KEYS) {
    const raw = src[key];
    if (raw == null || typeof raw !== 'object') return DEFAULT_CONFIG.unitRealmBase;
    const base = Number((raw as Record<string, unknown>).base);
    const growth = Number((raw as Record<string, unknown>).growth);
    if (!Number.isFinite(base) || base <= 0) return DEFAULT_CONFIG.unitRealmBase;
    if (!Number.isFinite(growth) || growth < 1) return DEFAULT_CONFIG.unitRealmBase;
    out[key] = { base, growth };
  }
  return out;
}

/** 隐藏词条条数区间：[min,max]，0<=min<=max<=6 */
function sanitizeCountRange(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return DEFAULT_CONFIG.unitHiddenAffixCount;
  const lo = Math.floor(Number(value[0]));
  const hi = Math.floor(Number(value[1]));
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) return DEFAULT_CONFIG.unitHiddenAffixCount;
  if (lo < 0 || hi > 6 || lo > hi) return DEFAULT_CONFIG.unitHiddenAffixCount;
  return [lo, hi];
}

function sanitizeZonePower(value: unknown): ZonePowerConfig {
  const fallback = DEFAULT_CONFIG.zonePower;
  if (value == null || typeof value !== 'object') return fallback;
  const src = value as Record<string, unknown>;
  const realmWeight = Number(src.realmWeight);
  const equipWeight = Number(src.equipWeight);
  const skillDivisor = Number(src.skillDivisor);
  if (!Number.isFinite(realmWeight) || realmWeight <= 0) return fallback;
  if (!Number.isFinite(equipWeight) || equipWeight < 0) return fallback;
  if (!Number.isInteger(skillDivisor) || skillDivisor < 1) return fallback;
  return { realmWeight, equipWeight, skillDivisor };
}

function sanitizeAction(value: unknown): AppConfig['lootFallbackAction'] {
  return value === 'keep' || value === 'salvage' || value === 'sell' || value === 'discard'
    ? value
    : DEFAULT_CONFIG.lootFallbackAction;
}

function load(): AppConfig {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const file = path.join(dir, '..', '..', '..', 'config', 'app.config.json');
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppConfig> & Record<string, unknown>;
    return {
      maxCharactersPerAccount: sanitizeInt(parsed.maxCharactersPerAccount, DEFAULT_CONFIG.maxCharactersPerAccount, 1, 10),
      devToolRateLimitPerMinute: sanitizeInt(
        parsed.devToolRateLimitPerMinute,
        DEFAULT_CONFIG.devToolRateLimitPerMinute,
        1,
        1000,
      ),
      spiritBudget: sanitizeInt(parsed.spiritBudget, DEFAULT_CONFIG.spiritBudget, 1, 10000),
      maxSkillLevel: sanitizeInt(parsed.maxSkillLevel, DEFAULT_CONFIG.maxSkillLevel, 1, 1000),
      enlightenBaseCost: sanitizeInt(parsed.enlightenBaseCost, DEFAULT_CONFIG.enlightenBaseCost, 1, 10_000_000),
      synergyBonusPct: sanitizeInt(parsed.synergyBonusPct, DEFAULT_CONFIG.synergyBonusPct, 0, 1000),
      realmBreakthroughCosts: sanitizeCosts(parsed.realmBreakthroughCosts),
      unitRealmBase: sanitizeRealmBase(parsed.unitRealmBase),
      unitHiddenAffixCount: sanitizeCountRange(parsed.unitHiddenAffixCount),
      lootFallbackAction: sanitizeAction(parsed.lootFallbackAction),
      lootSalvageLingyunPerTier: sanitizeInt(parsed.lootSalvageLingyunPerTier, DEFAULT_CONFIG.lootSalvageLingyunPerTier, 0, 1_000_000),
      lootSellSpiritStonesPerTier: sanitizeInt(parsed.lootSellSpiritStonesPerTier, DEFAULT_CONFIG.lootSellSpiritStonesPerTier, 0, 1_000_000),
      maxKillsPerRequest: sanitizeInt(parsed.maxKillsPerRequest, DEFAULT_CONFIG.maxKillsPerRequest, 1, 1000),
      idleRoundsPerHour: sanitizeInt(parsed.idleRoundsPerHour, DEFAULT_CONFIG.idleRoundsPerHour, 1, 3600),
      idleEfficiencyPct: sanitizeInt(parsed.idleEfficiencyPct, DEFAULT_CONFIG.idleEfficiencyPct, 1, 100),
      idleMaxOfflineHours: sanitizeInt(parsed.idleMaxOfflineHours, DEFAULT_CONFIG.idleMaxOfflineHours, 1, 48),
      idleDailyItemCap: sanitizeInt(parsed.idleDailyItemCap, DEFAULT_CONFIG.idleDailyItemCap, 0, 100000),
      zonePower: sanitizeZonePower(parsed.zonePower),
      zoneBossExtraDraws: sanitizeInt(parsed.zoneBossExtraDraws, DEFAULT_CONFIG.zoneBossExtraDraws, 0, 100),
    };
  } catch (error) {
    console.warn('[config] 读取 app.config.json 失败，使用默认配置:', (error as Error).message);
    return DEFAULT_CONFIG;
  }
}

export const APP_CONFIG: AppConfig = load();
