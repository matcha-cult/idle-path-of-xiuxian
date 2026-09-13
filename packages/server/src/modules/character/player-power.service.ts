/**
 * 玩家战力（确定性战力模型，`ai-docs/settings-revision-2.md` §6.1）
 *
 * 公式：
 *   playerPower = 境界 × realmWeight + 已装备件数 × equipWeight + floor(功法等级和 / skillDivisor)
 * 权重来自 `APP_CONFIG.zonePower`（`common/config/app-config.ts:91`）。
 *
 * 为什么单独抽出：§6 的胜负判定是**确定性**的（`playerPower ≥ threshold`），
 * 秘境内部层数（zone 域）与地图节点门槛（map 域）必须用**同一份**战力口径，
 * 否则玩家会在两个界面上看到不同的「战力」。zone 域原本把该逻辑内联在
 * `zone.service.ts:60-75`；这里上提到 character（基础设施层）后由两域共用，
 * 既避免复制 SQL，也避免 zone ↔ map 的模块环（map 不能依赖 zone）。
 */
import { Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../common/config/app-config.js';
import { GameDatabaseService } from '../game/game-database.service.js';

@Injectable()
export class PlayerPowerService {
  constructor(private readonly gameDb: GameDatabaseService) {}

  /**
   * 取角色战力。
   *
   * @param characterId 角色 id
   * @param realm 当前境界序号（1~14）
   * @returns 战力数值；DB 返回非法值时不额外兜底（与原 `ZoneService.playerPower` 一致）
   */
  async compute(characterId: number, realm: number): Promise<number> {
    const [equip, skills] = await Promise.all([
      this.gameDb.query<{ c: string }>(
        "SELECT COUNT(*)::text AS c FROM game_items WHERE character_id = $1 AND status = 'equipped'",
        [characterId],
      ),
      this.gameDb.query<{ s: string }>(
        'SELECT COALESCE(SUM(level), 0)::text AS s FROM game_learned_skills WHERE character_id = $1',
        [characterId],
      ),
    ]);
    const cfg = APP_CONFIG.zonePower;
    const equipCount = Number(equip.rows[0] ? equip.rows[0].c : 0);
    const skillSum = Number(skills.rows[0] ? skills.rows[0].s : 0);
    return realm * cfg.realmWeight + equipCount * cfg.equipWeight + Math.floor(skillSum / cfg.skillDivisor);
  }
}
