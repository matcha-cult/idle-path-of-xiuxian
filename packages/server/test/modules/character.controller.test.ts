import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CharacterController } from '../../src/modules/character/character.controller.js';
import { stub } from '../helpers/stub.js';

function makeController() {
  const service = {
    check: stub(() => 'CHECK'),
    create: stub(() => 'CREATE'),
    info: stub(() => 'INFO'),
  };
  return { controller: new CharacterController(service as never), service };
}

describe('CharacterController 边界', () => {
  test('check/info 直接转发', async () => {
    const { controller, service } = makeController();
    assert.equal(await controller.check(3), 'CHECK');
    assert.equal(await controller.info(3), 'INFO');
    assert.deepEqual(service.check.last, [3]);
    assert.deepEqual(service.info.last, [3]);
  });

  test('create：昵称缺失/非字符串 -> 失败且不触达服务', async () => {
    for (const body of [{}, { nickname: 1 }, { nickname: null, gender: 'male' }]) {
      const { controller, service } = makeController();
      const res = (await controller.create(1, body as never)) as { success: boolean };
      assert.equal(res.success, false);
      assert.equal(service.create.callCount, 0);
    }
  });

  test('create：性别缺失 -> 失败', async () => {
    const { controller, service } = makeController();
    const res = (await controller.create(1, { nickname: '甲' } as never)) as { success: boolean };
    assert.equal(res.success, false);
    assert.equal(service.create.callCount, 0);
  });

  test('create：性别非法（含大小写不符/空串）-> 失败', async () => {
    for (const gender of ['MALE', '', 'other', ' male']) {
      const { controller, service } = makeController();
      const res = (await controller.create(1, { nickname: '甲', gender })) as { success: boolean };
      assert.equal(res.success, false, `gender=${gender}`);
      assert.equal(service.create.callCount, 0);
    }
  });

  test('create：合法 male/female -> 透传', async () => {
    for (const gender of ['male', 'female'] as const) {
      const { controller, service } = makeController();
      assert.equal(await controller.create(9, { nickname: '甲', gender }), 'CREATE');
      assert.deepEqual(service.create.last, [9, '甲', gender]);
    }
  });

  test('create：空字符串昵称 -> 失败且不触达服务（Controller 层先拦）', async () => {
    const { controller, service } = makeController();
    const res = (await controller.create(9, { nickname: '', gender: 'male' })) as { success: boolean };
    assert.equal(res.success, false);
    assert.equal(service.create.callCount, 0);
  });

  test('create：纯空白昵称被透传（去空白判定属 CharacterService）', async () => {
    const { controller, service } = makeController();
    await controller.create(9, { nickname: '   ', gender: 'male' });
    assert.deepEqual(service.create.last, [9, '   ', 'male']);
  });
});
