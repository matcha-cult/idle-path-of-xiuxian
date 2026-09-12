import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CharacterService } from '../../src/modules/character/character.service.js';
import { FakeDatabase } from '../helpers/fake-db.js';
import { APP_CONFIG } from '../../src/common/config/app-config.js';

function makeService(fake: FakeDatabase): CharacterService {
  return new CharacterService(fake as never);
}

const ROW = {
  id: 5, user_id: 7, nickname: '道友', gender: 'male', title: '散修',
  spirit_stones: '123', silver: '0', realm: 3, lingyun: '9', jade_slips: '2',
};

describe('CharacterService.check / info 边界', () => {
  test('无角色 -> hasCharacter=false', async () => {
    const fake = new FakeDatabase().on(/FROM characters/, { rows: [] });
    const res = await makeService(fake).check(7);
    assert.equal(res.success, true);
    assert.equal(res.data?.hasCharacter, false);
    assert.equal(res.data?.character, null);
  });

  test('info 无角色 -> 失败', async () => {
    const fake = new FakeDatabase().on(/FROM characters/, { rows: [] });
    const res = await makeService(fake).info(7);
    assert.equal(res.success, false);
  });

  test('findByUserId 做 BIGINT 字符串 -> number 转换', async () => {
    const fake = new FakeDatabase().on(/FROM characters/, { rows: [ROW] });
    const character = await makeService(fake).findByUserId(7);
    assert.equal(character?.id, 5);
    assert.equal(character?.spiritStones, 123);
    assert.equal(character?.lingyun, 9);
    assert.equal(character?.jadeSlips, 2);
    assert.equal(typeof character?.id, 'number');
  });
});

describe('CharacterService.create 边界', () => {
  test('已达上限 -> 失败', async () => {
    const fake = new FakeDatabase().on(/COUNT\(\*\)/, { rows: [{ count: String(APP_CONFIG.maxCharactersPerAccount) }] });
    const res = await makeService(fake).create(7, '甲', 'male');
    assert.equal(res.success, false);
    assert.match(res.message, /上限/);
  });

  test('已存在角色（未达上限）-> 失败', async () => {
    const original = APP_CONFIG.maxCharactersPerAccount;
    APP_CONFIG.maxCharactersPerAccount = 3;
    try {
      const fake = new FakeDatabase().on(/COUNT\(\*\)/, { rows: [{ count: '1' }] });
      const res = await makeService(fake).create(7, '甲', 'male');
      assert.equal(res.success, false);
      assert.match(res.message, /已存在角色/);
    } finally {
      APP_CONFIG.maxCharactersPerAccount = original;
    }
  });

  const emptyCases: Array<[string, string]> = [['', '空串'], ['   ', '纯空白'], ['\t\n', '控制字符']];
  for (const [nickname, label] of emptyCases) {
    test(`昵称 ${label} -> 失败`, async () => {
      const fake = new FakeDatabase().on(/COUNT\(\*\)/, { rows: [{ count: '0' }] });
      const res = await makeService(fake).create(7, nickname, 'male');
      assert.equal(res.success, false);
      assert.match(res.message, /不能为空/);
    });
  }

  test('昵称 50 字符 -> 通过（上界）', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '0' }] })
      .on(/INSERT INTO characters/, { rows: [ROW] });
    const res = await makeService(fake).create(7, 'a'.repeat(50), 'male');
    assert.equal(res.success, true);
  });

  test('昵称 51 字符 -> 失败（上界+1）', async () => {
    const fake = new FakeDatabase().on(/COUNT\(\*\)/, { rows: [{ count: '0' }] });
    const res = await makeService(fake).create(7, 'a'.repeat(51), 'male');
    assert.equal(res.success, false);
    assert.match(res.message, /最长50/);
  });

  test('创建成功：昵称去除首尾空白后落库', async () => {
    const fake = new FakeDatabase()
      .on(/COUNT\(\*\)/, { rows: [{ count: '0' }] })
      .on(/INSERT INTO characters/, { rows: [ROW] });
    const res = await makeService(fake).create(7, '  道友  ', 'female');
    assert.equal(res.success, true);
    const insert = fake.lastCall(/INSERT INTO characters/);
    assert.equal(insert?.params[1], '道友');
    assert.equal(insert?.params[2], 'female');
  });
});
