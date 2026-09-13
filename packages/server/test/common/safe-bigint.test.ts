import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  bigintToSafeNumber,
  MAX_SAFE_BIGINT,
  MIN_SAFE_BIGINT,
} from '../../src/common/utils/safe-bigint.js';

describe('bigintToSafeNumber 正常路径', () => {
  test('十进制字符串 -> 精确 number', () => {
    assert.equal(bigintToSafeNumber('0', 'v'), 0);
    assert.equal(bigintToSafeNumber('123', 'v'), 123);
    assert.equal(bigintToSafeNumber('9007199254740991', 'v'), Number.MAX_SAFE_INTEGER);
    assert.equal(bigintToSafeNumber('-9007199254740991', 'v'), Number.MIN_SAFE_INTEGER);
  });

  test('带前导空格 -> 容忍 trim', () => {
    assert.equal(bigintToSafeNumber(' 42 ', 'v'), 42);
  });

  test('number 输入：安全整数原样返回', () => {
    assert.equal(bigintToSafeNumber(0, 'v'), 0);
    assert.equal(bigintToSafeNumber(-7, 'v'), -7);
    assert.equal(bigintToSafeNumber(Number.MAX_SAFE_INTEGER, 'v'), Number.MAX_SAFE_INTEGER);
  });

  test('bigint 输入：范围内转 number', () => {
    assert.equal(bigintToSafeNumber(123n, 'v'), 123);
    assert.equal(bigintToSafeNumber(MAX_SAFE_BIGINT, 'v'), Number.MAX_SAFE_INTEGER);
    assert.equal(bigintToSafeNumber(MIN_SAFE_BIGINT, 'v'), Number.MIN_SAFE_INTEGER);
  });

  test('null / undefined -> 0（缺失列不参与精度运算）', () => {
    assert.equal(bigintToSafeNumber(null, 'v'), 0);
    assert.equal(bigintToSafeNumber(undefined, 'v'), 0);
  });
});

describe('bigintToSafeNumber 精度上界（2^53）', () => {
  test('MAX_SAFE_INTEGER + 1 字符串 -> 抛 RangeError（fail-fast，不静默丢精度）', () => {
    assert.throws(() => bigintToSafeNumber('9007199254740992', 'v'), {
      name: 'RangeError',
      message: /超出安全整数范围/,
    });
  });

  test('远超上界（1e18 量级）字符串 -> RangeError', () => {
    assert.throws(() => bigintToSafeNumber('1000000000000000000', 'lingyun'), RangeError);
  });

  test('MIN_SAFE_INTEGER - 1 字符串 -> RangeError', () => {
    assert.throws(() => bigintToSafeNumber('-9007199254740992', 'v'), RangeError);
  });

  test('超过安全范围的 number（1e21 浮点）-> RangeError', () => {
    assert.throws(() => bigintToSafeNumber(1e21, 'v'), RangeError);
  });

  test('超过安全范围的 bigint -> RangeError', () => {
    assert.throws(() => bigintToSafeNumber(MAX_SAFE_BIGINT + 1n, 'v'), RangeError);
  });
});

describe('bigintToSafeNumber 非法输入', () => {
  const bad: unknown[] = ['abc', '', '  ', '12.5', '0x10', '1e3', '++1', '--1', '1_000'];
  for (const raw of bad) {
    test(`非十进制字符串 ${JSON.stringify(raw)} -> RangeError`, () => {
      assert.throws(() => bigintToSafeNumber(raw as never, 'v'), RangeError);
    });
  }

  test('不支持的类型（Symbol / object）-> RangeError', () => {
    assert.throws(() => bigintToSafeNumber(Symbol('x') as never, 'v'), RangeError);
    assert.throws(() => bigintToSafeNumber({} as never, 'v'), RangeError);
  });

  test('非整数 number（1.5 / NaN / Infinity）-> RangeError', () => {
    for (const n of [1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(() => bigintToSafeNumber(n, 'v'), RangeError);
    }
  });

  test('错误信息带字段名（便于定位列）', () => {
    assert.throws(() => bigintToSafeNumber('9007199254740992', 'game_wallets.amount'), /game_wallets\.amount/);
  });
});