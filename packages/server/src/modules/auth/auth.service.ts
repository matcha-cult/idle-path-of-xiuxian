/**
 * 用户认证服务
 *
 * 范围：
 * - 注册
 * - 登录
 * - JWT 签发/验证
 *
 * 不包含手机号、验证码、第三方登录等复杂能力。
 */
import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { signJwt, verifyJwt, type JwtPayload } from '../../common/auth/jwt.js';
import { DatabaseService } from '../database/database.service.js';

const SALT_ROUNDS = 10;
const PASSWORD_MIN_LENGTH = 6;

export type { JwtPayload };

export interface AuthUser {
  id: number;
  username: string;
}

export interface TokenVerifyResult {
  valid: boolean;
  decoded?: JwtPayload;
}

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async register(
    username: string,
    password: string,
  ): Promise<{ success: boolean; message: string; data?: { token: string; user: AuthUser } }> {
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      return { success: false, message: '用户名不能为空' };
    }
    if (normalizedUsername.length < 3 || normalizedUsername.length > 50) {
      return { success: false, message: '用户名长度需在 3-50 个字符之间' };
    }
    if (!password || password.length < PASSWORD_MIN_LENGTH) {
      return { success: false, message: `密码至少${PASSWORD_MIN_LENGTH}个字符` };
    }

    const exist = await this.database.query<{ id: number }>(
      'SELECT id FROM users WHERE username = $1',
      [normalizedUsername],
    );
    if (exist.rows.length > 0) {
      return { success: false, message: '用户名已存在' };
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await this.database.query<{ id: number; username: string }>(
      `INSERT INTO users (username, password, created_at, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, username`,
      [normalizedUsername, hashedPassword],
    );

    const user = result.rows[0];
    const token = this.generateToken({ id: Number(user.id), username: String(user.username) });

    return {
      success: true,
      message: '注册成功',
      data: { token, user: { id: Number(user.id), username: String(user.username) } },
    };
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ success: boolean; message: string; data?: { token: string; user: AuthUser } }> {
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      return { success: false, message: '用户名和密码不能为空' };
    }

    const result = await this.database.query<{
      id: number;
      username: string;
      password: string;
    }>('SELECT id, username, password FROM users WHERE username = $1', [normalizedUsername]);

    const user = result.rows[0];
    if (!user || !user.password) {
      return { success: false, message: '用户名或密码错误' };
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return { success: false, message: '用户名或密码错误' };
    }

    await this.database.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    const token = this.generateToken({ id: Number(user.id), username: String(user.username) });

    return {
      success: true,
      message: '登录成功',
      data: { token, user: { id: Number(user.id), username: String(user.username) } },
    };
  }

  generateToken(payload: JwtPayload): string {
    return signJwt(payload);
  }

  verifyToken(token: string): TokenVerifyResult {
    const decoded = verifyJwt(token);
    return decoded ? { valid: true, decoded } : { valid: false };
  }
}
