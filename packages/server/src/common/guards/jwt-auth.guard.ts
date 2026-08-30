/**
 * 全局 JWT 认证 Guard
 *
 * 默认拦截所有路由；通过 @Public() 标记公开接口。
 */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service.js';

export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { userId?: number }>();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('登录状态无效，请重新登录');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const result = this.authService.verifyToken(token);
    if (!result.valid || !result.decoded) {
      throw new UnauthorizedException('登录状态无效，请重新登录');
    }

    request.userId = result.decoded.id;
    return true;
  }
}
