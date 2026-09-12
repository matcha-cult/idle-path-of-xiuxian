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
}

const DEFAULT_CONFIG: AppConfig = {
  maxCharactersPerAccount: 1,
  devToolRateLimitPerMinute: 5,
  spiritBudget: 100,
  maxSkillLevel: 20,
  enlightenBaseCost: 100,
  synergyBonusPct: 20,
};

function sanitizeInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
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
    };
  } catch (error) {
    console.warn('[config] 读取 app.config.json 失败，使用默认配置:', (error as Error).message);
    return DEFAULT_CONFIG;
  }
}

export const APP_CONFIG: AppConfig = load();
