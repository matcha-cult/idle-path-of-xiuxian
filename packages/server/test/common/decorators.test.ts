import 'reflect-metadata';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Public } from '../../src/common/decorators/public.decorator.js';
import { extractUserId } from '../../src/common/decorators/user-id.decorator.js';
import { IS_PUBLIC_KEY } from '../../src/common/guards/jwt-auth.guard.js';

describe('Public 装饰器边界', () => {
  test('在类上写入 IS_PUBLIC_KEY=true', () => {
    class Demo {}
    Public()(Demo);
    assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, Demo), true);
  });
  test('IS_PUBLIC_KEY 常量稳定', () => {
    assert.equal(IS_PUBLIC_KEY, 'isPublic');
  });
});

describe('extractUserId 边界', () => {
  test('合法 id 返回原值', () => {
    assert.equal(extractUserId({ userId: 1 }), 1);
    assert.equal(extractUserId({ userId: 999999 }), 999999);
    assert.equal(extractUserId({ userId: -1 }), -1);
  });
  test('缺失/0/NaN -> 抛错', () => {
    for (const request of [{}, { userId: undefined }, { userId: 0 }, { userId: NaN }]) {
      assert.throws(() => extractUserId(request as { userId?: number }), /缺少用户身份/);
    }
  });
});
