/**
 * 角色服务
 *
 * 范围：
 * - 检查是否有角色
 * - 创建角色
 * - 获取角色信息
 *
 * 角色系统为当前项目独立设计，不与任何参考废案直接合并。
 */
import { Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../common/config/app-config.js';
import { DatabaseService } from '../database/database.service.js';

const DEFAULT_REGISTRATION_SPIRIT_STONES = Number(
  process.env.DEFAULT_REGISTRATION_SPIRIT_STONES ?? 10000,
);

export interface Character {
  id: number;
  userId: number;
  nickname: string;
  gender: string;
  title: string | null;
  spiritStones: number;
  /** （弃用）银两，不再使用 */
  silver: number;
  /** 当前境界序号 1~14 */
  realm: number;
  /** 灵韵（角色绑定成长资源） */
  lingyun: number;
}

export interface CharacterResult {
  success: boolean;
  message: string;
  data?: {
    character: Character | null;
    hasCharacter: boolean;
  };
}

/** characters 表行（BIGINT 由 pg 以字符串返回） */
type CharacterRow = {
  id: number;
  user_id: number;
  nickname: string;
  gender: string;
  title: string | null;
  spirit_stones: string | number;
  silver: string | number;
  realm: number;
  lingyun: string | number;
};

@Injectable()
export class CharacterService {
  constructor(private readonly database: DatabaseService) {}

  async check(userId: number): Promise<CharacterResult> {
    const character = await this.findByUserId(userId);
    return {
      success: true,
      message: character ? '已有角色' : '未创建角色',
      data: {
        character,
        hasCharacter: Boolean(character),
      },
    };
  }

  async create(userId: number, nickname: string, gender: 'male' | 'female'): Promise<CharacterResult> {
    const maxCharacters = APP_CONFIG.maxCharactersPerAccount;
    const countResult = await this.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM characters WHERE user_id = $1',
      [userId],
    );
    const current = Number(countResult.rows[0]?.count ?? 0);
    if (current >= maxCharacters) {
      return { success: false, message: `角色数量已达上限（${maxCharacters}）` };
    }
    if (current > 0) {
      return { success: false, message: '已存在角色，无法重复创建' };
    }

    const normalizedNickname = nickname.trim();
    if (!normalizedNickname) {
      return { success: false, message: '角色昵称不能为空' };
    }
    if (normalizedNickname.length > 50) {
      return { success: false, message: '角色昵称最长50字符' };
    }

    const result = await this.database.query<CharacterRow>(
      `INSERT INTO characters (user_id, nickname, gender, title, spirit_stones, silver, created_at, updated_at)
       VALUES ($1, $2, $3, '散修', $4, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, user_id, nickname, gender, title, spirit_stones, silver, realm, lingyun`,
      [userId, normalizedNickname, gender, DEFAULT_REGISTRATION_SPIRIT_STONES],
    );

    const row = result.rows[0];
    return {
      success: true,
      message: '角色创建成功',
      data: {
        character: this.toCharacter(row),
        hasCharacter: true,
      },
    };
  }

  async info(userId: number): Promise<CharacterResult> {
    const character = await this.findByUserId(userId);
    if (!character) {
      return { success: false, message: '角色不存在' };
    }
    return {
      success: true,
      message: '获取角色成功',
      data: {
        character,
        hasCharacter: true,
      },
    };
  }

  /**
   * 按 userId 查询角色。
   * public：供物品服务（game 库）跨库解析角色归属与境界校验使用。
   */
  async findByUserId(userId: number): Promise<Character | null> {
    const result = await this.database.query<CharacterRow>(
      `SELECT id, user_id, nickname, gender, title, spirit_stones, silver, realm, lingyun
       FROM characters WHERE user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return row ? this.toCharacter(row) : null;
  }

  private toCharacter(row: CharacterRow): Character {
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      nickname: String(row.nickname),
      gender: String(row.gender),
      title: row.title ? String(row.title) : null,
      spiritStones: Number(row.spirit_stones),
      silver: Number(row.silver),
      realm: Number(row.realm),
      lingyun: Number(row.lingyun),
    };
  }
}
