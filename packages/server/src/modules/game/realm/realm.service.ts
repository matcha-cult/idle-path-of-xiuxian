/**
 * 境界突破服务（P2.5）
 *
 * - 突破必定成功：消耗灵韵 → realm+1（单库单表原子 UPDATE）
 * - 无失败惩罚、无次数限制（设定修改 11 收敛实现）
 * - 14 境合道封顶 → MAX_REALM_REACHED
 */
import { Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../common/config/app-config.js';
import { CharacterService } from '../../character/character.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { type FailResult, MAX_REALM, fail, realmName } from './realm.types.js';

@Injectable()
export class RealmService {
  constructor(
    private readonly userDb: DatabaseService,
    private readonly characterService: CharacterService,
  ) {}

  private async resolveCharacter(userId: number) {
    const character = await this.characterService.findByUserId(userId);
    if (!character) return { error: fail('CHARACTER_NOT_FOUND', '尚未创建角色') };
    return { character };
  }

  private nextCost(realm: number): number | null {
    if (realm >= MAX_REALM) return null;
    return APP_CONFIG.realmBreakthroughCosts[realm] ?? null;
  }

  async status(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    const nextCost = this.nextCost(character.realm);
    return {
      success: true,
      message: '获取境界状态成功',
      data: {
        realm: character.realm,
        realmName: realmName(character.realm),
        lingyun: character.lingyun,
        nextCost,
        isMax: character.realm >= MAX_REALM,
      },
    };
  }

  async breakthrough(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    const cost = this.nextCost(character.realm);
    if (cost == null) return fail('MAX_REALM_REACHED', `已达封顶境界（${realmName(character.realm)}）`);

    // 单条原子 UPDATE：扣费 + 升境；realm 快照守卫防并发按旧成本重复扣费
    const upd = await this.userDb.query<{ realm: number; lingyun: string }>(
      `UPDATE characters SET realm = realm + 1, lingyun = lingyun - $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND realm = $3 AND lingyun >= $1 RETURNING realm, lingyun`,
      [cost, character.id, character.realm],
    );
    if (upd.rows.length === 0) {
      const now = await this.characterService.findByUserId(userId);
      if (now && now.realm !== character.realm) {
        return fail('REALM_CHANGED', '境界已变化，请重试');
      }
      return fail('LINGYUN_NOT_ENOUGH', `灵韵不足：突破需 ${cost}，当前 ${character.lingyun}`);
    }
    const nowRealm = Number(upd.rows[0].realm);
    return {
      success: true,
      message: `突破成功：${realmName(character.realm)} → ${realmName(nowRealm)}`,
      data: { realm: nowRealm, realmName: realmName(nowRealm), lingyun: Number(upd.rows[0].lingyun) },
    };
  }
}
