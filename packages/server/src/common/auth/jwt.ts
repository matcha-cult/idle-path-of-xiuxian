/**
 * JWT 签发/校验（纯函数，无依赖注入）
 *
 * 抽出的原因：HTTP 侧（AuthService）与 WS 握手鉴权（IonetModule.forRoot 的 authenticate）
 * 都在模块定义期之外需要同一套密钥与语义；两个入口共用本文件可避免密钥/过期策略分叉。
 *
 * 注意：密钥与过期时间在模块加载时读取 env，因此 `import 'dotenv/config'` 必须先于本模块被加载
 * （main.ts 已保证）。
 */
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  id: number;
  username: string;
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const JWT_EXPIRES_IN_SECONDS = Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 604800);

/** 签发 token（与旧 AuthService.generateToken 行为一致） */
export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN_SECONDS });
}

/** 校验 token；非法/过期/被篡改一律返回 null（不抛错） */
export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * 从 `Authorization: Bearer <token>` 形式的头里取出并校验用户。
 * 供 WS 握手鉴权使用；头缺失/格式不符/校验失败 → null。
 */
export function verifyBearerHeader(raw: string | string[] | undefined): JwtPayload | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return null;
  const token = value.slice('Bearer '.length).trim();
  if (!token) return null;
  return verifyJwt(token);
}
