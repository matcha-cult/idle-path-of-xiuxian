import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ActionError,
  dataOf,
  fail,
  requireUserId,
  toFiniteInt,
  toFiniteNumber,
  userIdOf,
} from '../../src/ionet/action-support.js';
import { flowContext } from '../helpers/flow.js';

describe('toFiniteInt 边界', () => {
  const cases: Array<[unknown, number | undefined]> = [
    ['', undefined], ['   ', undefined], ['12', 12], ['12.7', 12], ['-3.9', -4],
    ['0x10', 16], ['1e3', 1000], ['abc', undefined], ['12abc', undefined],
    [1.5, 1], [-1.5, -2], [0, 0], [-0, -0], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    [NaN, undefined], [Infinity, undefined], [-Infinity, undefined],
    [null, undefined], [undefined, undefined], [true, undefined], [false, undefined],
    [{}, undefined], [[], undefined], [['1'], undefined],
  ];
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input) ?? String(input)} -> ${String(expected)}`, () => {
      assert.strictEqual(toFiniteInt(input), expected);
    });
  }
});

describe('toFiniteNumber 边界', () => {
  const cases: Array<[unknown, number | undefined]> = [
    ['', undefined], ['  ', undefined], ['12', 12], ['12.7', 12.7], ['-3.9', -3.9],
    [1.5, 1.5], [0, 0], [NaN, undefined], [Infinity, undefined],
    [null, undefined], [true, undefined], [[], undefined],
  ];
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input) ?? String(input)} -> ${String(expected)}`, () => {
      assert.strictEqual(toFiniteNumber(input), expected);
    });
  }
});

describe('dataOf 边界', () => {
  test('null/undefined -> {}', () => {
    assert.deepEqual(dataOf(null), {});
    assert.deepEqual(dataOf(undefined), {});
  });
  test('原始值 -> {}', () => {
    assert.deepEqual(dataOf(1), {});
    assert.deepEqual(dataOf('x'), {});
    assert.deepEqual(dataOf(true), {});
  });
  test('对象原样返回', () => {
    const obj = { a: 1 };
    assert.strictEqual(dataOf(obj), obj);
  });
});

describe('fail / ActionError', () => {
  test('fail 结构固定', () => {
    assert.deepEqual(fail('X', 'msg'), { success: false, message: 'msg', data: { code: 'X' } });
  });
  test('各预置错误码', () => {
    assert.equal(ActionError.unauthorized().data.code, 'UNAUTHORIZED');
    assert.equal(ActionError.invalidParam().data.code, 'INVALID_PARAM');
    assert.equal(ActionError.invalidParam('自定义').message, '自定义');
    assert.equal(ActionError.characterNotFound().data.code, 'CHARACTER_NOT_FOUND');
    assert.equal(ActionError.forbidden().data.code, 'FORBIDDEN');
  });
});

describe('userIdOf / requireUserId 边界', () => {
  test('未鉴权(0n) -> null / UNAUTHORIZED', () => {
    const ctx = flowContext();
    assert.equal(userIdOf(ctx), null);
    const res = requireUserId(ctx);
    assert.equal(typeof res, 'object');
    assert.equal((res as { data: { code: string } }).data.code, 'UNAUTHORIZED');
  });
  test('已鉴权 -> number', () => {
    const ctx = flowContext({ userId: 42 });
    assert.equal(userIdOf(ctx), 42);
    assert.equal(requireUserId(ctx), 42);
  });
});
