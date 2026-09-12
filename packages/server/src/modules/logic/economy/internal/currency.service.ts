/**
 * 通货服务：图鉴（持有量 + 用途）+ 开发注入
 *
 * 钱包与通货定义均在 game 库（game_wallets/game_currencies），与物品同库。
 */
import { Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../../common/config/app-config.js';
import { RateLimiterService } from '../../../../common/services/rate-limiter.service.js';
import { CharacterService } from '../../../character/character.service.js';
import { GameDatabaseService } from '../../../game/game-database.service.js';
import { type CurrencyRow, type FailResult, type WalletRow, fail } from './currency.types.js';

interface EssenceRow {
  id: number;
  code: string;
  name: string;
  polarity: string;
  target_family: string;
  description: string | null;
}

interface EssenceInvRow {
  id: number;
  character_id: number;
  essence_id: number;
  count: string;
}

@Injectable()
export class CurrencyService {
  constructor(
    private readonly gameDb: GameDatabaseService,
    private readonly characterService: CharacterService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  private async resolveCharacter(userId: number) {
    const character = await this.characterService.findByUserId(userId);
    if (!character) return { error: fail('CHARACTER_NOT_FOUND', '尚未创建角色') };
    return { character };
  }

  async catalog(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    const [currencies, wallets] = await Promise.all([
      this.gameDb.query<CurrencyRow>('SELECT * FROM game_currencies ORDER BY id'),
      this.gameDb.query<WalletRow>(
        'SELECT * FROM game_wallets WHERE character_id = $1',
        [character.id],
      ),
    ]);
    const owned = new Map(wallets.rows.map((w) => [w.currency_code, Number(w.amount)]));
    return {
      success: true,
      message: '获取通货图鉴成功',
      data: {
        currencies: currencies.rows.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          description: c.description ?? '',
          implemented: Boolean(c.implemented),
          owned: owned.get(c.code) ?? 0,
        })),
      },
    };
  }

  /** 开发注入通货（生产禁用 + 共享限流） */
  async grant(
    userId: number,
    code: string,
    count: number,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    if ((process.env.NODE_ENV ?? 'development') === 'production') {
      return fail('FORBIDDEN', '开发接口在生产环境不可用');
    }
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    if (!Number.isInteger(count) || count < 1 || count > 9999) {
      return fail('INVALID_PARAM', 'count 需为 1~9999 的整数');
    }
    if (!this.rateLimiter.allow(userId, APP_CONFIG.devToolRateLimitPerMinute)) {
      return fail('RATE_LIMITED', `开发注入接口每分钟最多调用 ${APP_CONFIG.devToolRateLimitPerMinute} 次`);
    }
    const codeRows = await this.gameDb.query<{ id: number; name: string }>(
      'SELECT id, name FROM game_currencies WHERE code = $1',
      [code],
    );
    const def = codeRows.rows[0];
    if (!def) return fail('CURRENCY_NOT_FOUND', `通货不存在：${code}`);

    const upd = await this.gameDb.query<WalletRow>(
      `INSERT INTO game_wallets (character_id, currency_code, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (character_id, currency_code)
       DO UPDATE SET amount = game_wallets.amount + EXCLUDED.amount, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [character.id, code, count],
    );
    return {
      success: true,
      message: `获得 ${def.name} ×${count}`,
      data: { code, amount: Number(upd.rows[0].amount) },
    };
  }

  // ===== 精华（P3.3：6 种定向精华，单阶） =====

  async catalogEssences(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    const [rows, inv] = await Promise.all([
      this.gameDb.query<EssenceRow>('SELECT * FROM game_essences ORDER BY id'),
      this.gameDb.query<EssenceInvRow>(
        'SELECT * FROM game_essence_inventory WHERE character_id = $1',
        [character.id],
      ),
    ]);
    const owned = new Map(inv.rows.map((r) => [Number(r.essence_id), Number(r.count)]));
    return {
      success: true,
      message: '获取精华图鉴成功',
      data: {
        essences: rows.rows.map((e) => ({
          id: e.id,
          code: e.code,
          name: e.name,
          polarity: e.polarity,
          targetFamily: e.target_family,
          description: e.description ?? '',
          owned: owned.get(e.id) ?? 0,
        })),
      },
    };
  }

  async grantEssence(
    userId: number,
    code: string,
    count: number,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    if ((process.env.NODE_ENV ?? 'development') === 'production') {
      return fail('FORBIDDEN', '开发接口在生产环境不可用');
    }
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      return fail('INVALID_PARAM', 'count 需为 1~99 的整数');
    }
    if (!this.rateLimiter.allow(userId, APP_CONFIG.devToolRateLimitPerMinute)) {
      return fail('RATE_LIMITED', `开发注入接口每分钟最多调用 ${APP_CONFIG.devToolRateLimitPerMinute} 次`);
    }
    const rows = await this.gameDb.query<EssenceRow>('SELECT * FROM game_essences WHERE code = $1', [code]);
    const def = rows.rows[0];
    if (!def) return fail('ESSENCE_NOT_FOUND', `精华不存在：${code}`);

    const upd = await this.gameDb.query<EssenceInvRow>(
      `INSERT INTO game_essence_inventory (character_id, essence_id, count)
       VALUES ($1, $2, $3)
       ON CONFLICT (character_id, essence_id)
       DO UPDATE SET count = game_essence_inventory.count + EXCLUDED.count, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [character.id, def.id, count],
    );
    return {
      success: true,
      message: `获得 ${def.name} ×${count}`,
      data: { code, count: Number(upd.rows[0].count) },
    };
  }
}
