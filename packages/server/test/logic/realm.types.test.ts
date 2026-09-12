import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REALM, REALMS, fail, realmName } from '../../src/modules/logic/realm/internal/realm.types.js';
import * as kernel from '../../src/common/kernel/realm.js';

describe('realm.types 再导出边界', () => {
  test('与 common/kernel 为同一引用', () => {
    assert.equal(REALMS, kernel.REALMS);
    assert.equal(MAX_REALM, kernel.MAX_REALM);
    assert.equal(realmName, kernel.realmName);
  });
  test('本模块 fail 结构固定且每次新对象', () => {
    const a = fail('X', 'm');
    const b = fail('X', 'm');
    assert.deepEqual(a, { success: false, message: 'm', data: { code: 'X' } });
    assert.notEqual(a, b);
  });
  test('realmName 边界（复用内核实现）', () => {
    assert.equal(realmName(1), '铜皮');
    assert.equal(realmName(MAX_REALM), '合道');
    assert.equal(realmName(0), '未知');
    assert.equal(realmName(MAX_REALM + 1), '未知');
  });
});
