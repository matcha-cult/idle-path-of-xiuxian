/**
 * 通用事件计数服务（P6.2）
 *
 * 用途：为任务提供「累计型」目标（击杀/突破/炼器…）。
 * 存储：game_stat_counters(character_id, key, value)；key 约定：
 *   kill_total | kill:<unitCode> | kill_realm:<realm> | breakthrough_total | craft_total
 */
import { Injectable } from '@nestjs/common';
import { GameDatabaseService } from '../game-database.service.js';

@Injectable()
export class StatService {
  constructor(private readonly gameDb: GameDatabaseService) {}

  async increment(characterId: number, key: string, amount = 1): Promise<void> {
    if (!Number.isFinite(amount) || amount === 0) return;
    await this.gameDb.query(
      'INSERT INTO game_stat_counters (character_id, key, value, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT (character_id, key) DO UPDATE SET value = game_stat_counters.value + EXCLUDED.value, updated_at = CURRENT_TIMESTAMP',
      [characterId, key, amount],
    );
  }

  /** 击杀计数：总量 + 单位维度 + 境界维度 */
  async recordKill(characterId: number, unitCode: string, realm: number, count: number): Promise<void> {
    if (count <= 0) return;
    await this.increment(characterId, 'kill_total', count);
    await this.increment(characterId, 'kill:' + unitCode, count);
    await this.increment(characterId, 'kill_realm:' + realm, count);
  }

  async readAll(characterId: number): Promise<Map<string, number>> {
    const rows = await this.gameDb.query<{ key: string; value: string }>(
      'SELECT key, value FROM game_stat_counters WHERE character_id = $1',
      [characterId],
    );
    return new Map(rows.rows.map((r) => [r.key, Number(r.value)]));
  }
}
