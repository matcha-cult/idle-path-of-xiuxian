import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** 从已解析的请求对象中取用户 ID；缺失/非法 → 抛错 */
export function extractUserId(request: { userId?: number }): number {
  const userId = request.userId;
  if (!userId || Number.isNaN(userId)) {
    throw new Error('缺少用户身份');
  }
  return userId;
}

/** 从请求上下文读取 JWT 解析出的用户 ID */
export const UserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): number => {
  return extractUserId(ctx.switchToHttp().getRequest<Request & { userId?: number }>());
});
