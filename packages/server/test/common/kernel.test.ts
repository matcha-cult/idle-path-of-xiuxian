import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EFFECT_LABELS, PERCENT_KEYS } from '../../src/common/kernel/effect.js';
import { MAX_REALM, REALMS, realmName } from '../../src/common/kernel/realm.js';

describe('realmName 边界', () => {
  test('1 境与 14 境', () => {
    assert.equal(realmName(1), '铜皮');
    assert.equal(realmName(MAX_REALM), '合道');
  });
  test('越界返回未知', () => {
    assert.equal(realmName(0), '未知');
    assert.equal(realmName(-1), '未知');
    assert.equal(realmName(15), '未知');
    assert.equal(realmName(999), '未知');
    assert.equal(realmName(NaN), '未知');
  });
  test('REALMS 长度与 MAX_REALM 一致', () => {
    assert.equal(REALMS.length, MAX_REALM);
    assert.equal(MAX_REALM, 14);
  });
});

describe('effect 词表边界', () => {
  test('PERCENT_KEYS 均为已登记效果键', () => {
    for (const key of PERCENT_KEYS) {
      assert.ok(key in EFFECT_LABELS, `${key} 不在 EFFECT_LABELS`);
    }
  });
  test('PERCENT_KEYS 边界（空串/未知键）', () => {
    assert.equal(PERCENT_KEYS.has(''), false);
    assert.equal(PERCENT_KEYS.has('atk'), false); // atk 是固定值而非百分比
    assert.equal(PERCENT_KEYS.has('hp_pct'), true);
  });
});
