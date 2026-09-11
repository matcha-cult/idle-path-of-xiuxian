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
  /** 物品生成接口（开发测试）单账户每分钟调用上限 */
  generateRateLimitPerMinute: number;
}

const DEFAULT_CONFIG: AppConfig = {
  maxCharactersPerAccount: 1,
  generateRateLimitPerMinute: 5,
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
      generateRateLimitPerMinute: sanitizeInt(
        parsed.generateRateLimitPerMinute,
        DEFAULT_CONFIG.generateRateLimitPerMinute,
        1,
        1000,
      ),
    };
  } catch (error) {
    console.warn('[config] 读取 app.config.json 失败，使用默认配置:', (error as Error).message);
    return DEFAULT_CONFIG;
  }
}

export const APP_CONFIG: AppConfig = load();
