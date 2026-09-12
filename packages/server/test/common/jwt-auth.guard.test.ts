import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard.js';

interface FakeRequest {
  headers: Record<string, string | undefined>;
  userId?: number;
}

function makeGuard(options: { isPublic?: boolean; verify?: (token: string) => { valid: boolean; decoded?: { id: number; username: string } } }) {
  const reflector = { getAllAndOverride: () => options.isPublic ?? false };
  const authService = {
    verifyToken: options.verify ?? ((token: string) => (token === 'good' ? { valid: true, decoded: { id: 7, username: 'u' } } : { valid: false })),
  };
  const guard = new JwtAuthGuard(reflector as never, authService as never);
  const request: FakeRequest = { headers: {} };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { guard, context: context as never, request };
}

describe('JwtAuthGuard 边界', () => {
  test('@Public 直接放行（即使无 header）', () => {
    const { guard, context } = makeGuard({ isPublic: true });
    assert.equal(guard.canActivate(context), true);
  });

  test('缺少 Authorization -> 401', () => {
    const { guard, context } = makeGuard({});
    assert.throws(() => guard.canActivate(context), UnauthorizedException);
  });

  test('非 Bearer 方案 -> 401', () => {
    const { guard, context, request } = makeGuard({});
    request.headers.authorization = 'Basic abc';
    assert.throws(() => guard.canActivate(context), UnauthorizedException);
  });

  test('Bearer 但 token 非法 -> 401', () => {
    const { guard, context, request } = makeGuard({});
    request.headers.authorization = 'Bearer bad';
    assert.throws(() => guard.canActivate(context), UnauthorizedException);
  });

  test('Bearer 且 token 合法 -> 放行并写入 request.userId', () => {
    const { guard, context, request } = makeGuard({});
    request.headers.authorization = 'Bearer good';
    assert.equal(guard.canActivate(context), true);
    assert.equal(request.userId, 7);
  });

  test('验证返回 valid=true 但 decoded 缺失 -> 401', () => {
    const { guard, context, request } = makeGuard({ verify: () => ({ valid: true }) });
    request.headers.authorization = 'Bearer good';
    assert.throws(() => guard.canActivate(context), UnauthorizedException);
  });

  test('Bearer 后带多余空格 -> 取 trim 后 token', () => {
    let seen = '';
    const { guard, context, request } = makeGuard({
      verify: (token) => { seen = token; return { valid: true, decoded: { id: 1, username: 'u' } }; },
    });
    request.headers.authorization = 'Bearer   good  ';
    assert.equal(guard.canActivate(context), true);
    assert.equal(seen, 'good');
  });
});
