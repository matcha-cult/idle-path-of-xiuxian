/**
 * Action 公共支撑：结果信封、错误码、FlowContext 取值
 *
 * 约定：Action 不抛异常，统一返回 { success, message, data? } 结果对象，
 * 由 ionet 的 BarSkeleton.execute 包进响应信封的 data 字段。
 */
import { type FlowContext } from '@nbb-ionet/core-framework';

export interface ActionFailResult {
  success: false;
  message: string;
  data: { code: string };
}

export function fail(code: string, message: string): ActionFailResult {
  return { success: false, message, data: { code } };
}

export const ActionError = {
  /** 未携带合法 token / token 过期 */
  unauthorized: (): ActionFailResult => fail('UNAUTHORIZED', '登录状态无效，请重新登录'),
  /** 参数不合法 */
  invalidParam: (message = '参数不合法'): ActionFailResult => fail('INVALID_PARAM', message),
  /** 尚未创建角色 */
  characterNotFound: (): ActionFailResult => fail('CHARACTER_NOT_FOUND', '尚未创建角色'),
  /** 生产环境禁用开发接口 */
  forbidden: (message = '开发接口在生产环境不可用'): ActionFailResult => fail('FORBIDDEN', message),
} as const;

/** 从 FlowContext 取已鉴权 userId（number）；未鉴权返回 null */
export function userIdOf(ctx: FlowContext): number | null {
  const id = ctx.getUserId();
  if (id === 0n) return null;
  return Number(id);
}

/**
 * 受保护 Action 的统一入口：未鉴权直接返回 UNAUTHORIZED。
 * 用法：const userId = requireUserId(ctx); if (typeof userId !== 'number') return userId;
 */
export function requireUserId(ctx: FlowContext): number | ActionFailResult {
  const userId = userIdOf(ctx);
  return userId ?? ActionError.unauthorized();
}

/** 字符串/数字 → 有限数值（可为小数）；非法/缺失 → undefined */
export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** 字符串/数字 → 有限整数；非法/缺失 → undefined */
export function toFiniteInt(value: unknown): number | undefined {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

/** 取 data 对象（非对象/缺失 → 空对象） */
export function dataOf(data: unknown): Record<string, unknown> {
  return data != null && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}
