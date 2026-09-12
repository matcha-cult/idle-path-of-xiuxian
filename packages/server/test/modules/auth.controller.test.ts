import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AuthController } from '../../src/modules/auth/auth.controller.js';
import { stub } from '../helpers/stub.js';

function makeController() {
  const service = {
    register: stub(() => 'REGISTER'),
    login: stub(() => 'LOGIN'),
  };
  return { controller: new AuthController(service as never), service };
}

describe('AuthController 边界', () => {
  test('register/login 正常透传字符串', async () => {
    const { controller, service } = makeController();
    assert.equal(await controller.register({ username: 'abc', password: 'secret' }), 'REGISTER');
    assert.deepEqual(service.register.last, ['abc', 'secret']);
    assert.equal(await controller.login({ username: 'abc', password: 'secret' }), 'LOGIN');
    assert.deepEqual(service.login.last, ['abc', 'secret']);
  });

  test('非字符串/缺失字段归一为空串（校验交由服务层）', async () => {
    const cases: Array<[unknown, string]> = [
      [{}, ''],
      [{ username: 1, password: 2 }, ''],
      [{ username: null, password: null }, ''],
      [{ username: { a: 1 }, password: [] }, ''],
    ];
    for (const [body, expected] of cases) {
      const { controller, service } = makeController();
      await controller.register(body as never);
      assert.deepEqual(service.register.last, [expected, expected]);
      await controller.login(body as never);
      assert.deepEqual(service.login.last, [expected, expected]);
    }
  });
});
