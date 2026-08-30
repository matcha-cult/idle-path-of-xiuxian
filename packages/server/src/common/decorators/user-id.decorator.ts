import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** 从请求上下文读取 JWT 解析出的用户 ID */
export const UserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): number => {
  const request = ctx.switchToHttp().getRequest<Request & { userId?: number }>();
  const userId = request.userId;
  if (!userId || Number.isNaN(userId)) {
    throw new Error('缺少用户身份');
  }
  return userId;
});
