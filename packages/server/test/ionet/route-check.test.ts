import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoDuplicateRoutes, findDuplicateRoutes } from '../../src/ionet/route-check.js';

describe('findDuplicateRoutes 边界', () => {
  test('空表 / 单条 -> 无重复', () => {
    assert.deepEqual(findDuplicateRoutes([]), []);
    assert.deepEqual(findDuplicateRoutes([{ cmd: 1, subCmd: 1, label: 'A.m' }]), []);
  });
  test('同 cmd 不同 subCmd 不算重复', () => {
    assert.deepEqual(findDuplicateRoutes([
      { cmd: 30, subCmd: 1, label: 'A.a' },
      { cmd: 30, subCmd: 2, label: 'A.b' },
    ]), []);
  });
  test('不同 cmd 同 subCmd 不算重复', () => {
    assert.deepEqual(findDuplicateRoutes([
      { cmd: 30, subCmd: 1, label: 'A.a' },
      { cmd: 40, subCmd: 1, label: 'B.a' },
    ]), []);
  });
  test('完全重复 -> 报告全部标签', () => {
    const dup = findDuplicateRoutes([
      { cmd: 30, subCmd: 1, label: 'A.a' },
      { cmd: 30, subCmd: 1, label: 'B.a' },
      { cmd: 30, subCmd: 1, label: 'C.a' },
    ]);
    assert.equal(dup.length, 1);
    assert.deepEqual(dup[0].labels, ['A.a', 'B.a', 'C.a']);
  });
  test('多组重复分别报告', () => {
    const dup = findDuplicateRoutes([
      { cmd: 1, subCmd: 1, label: 'x' }, { cmd: 1, subCmd: 1, label: 'y' },
      { cmd: 2, subCmd: 2, label: 'z' }, { cmd: 2, subCmd: 2, label: 'w' },
    ]);
    assert.equal(dup.length, 2);
  });
  test('边界值 0 与负数', () => {
    assert.equal(findDuplicateRoutes([{ cmd: 0, subCmd: 0, label: 'a' }, { cmd: 0, subCmd: 0, label: 'b' }]).length, 1);
    assert.equal(findDuplicateRoutes([{ cmd: -1, subCmd: -1, label: 'a' }, { cmd: -1, subCmd: -1, label: 'b' }]).length, 1);
  });
});

describe('assertNoDuplicateRoutes 边界', () => {
  test('无重复不抛错', () => {
    assert.doesNotThrow(() => assertNoDuplicateRoutes([{ cmd: 1, subCmd: 1, label: 'A.a' }]));
  });
  test('有重复抛错且信息含 cmd/subCmd/标签', () => {
    assert.throws(
      () => assertNoDuplicateRoutes([
        { cmd: 30, subCmd: 1, label: 'A.a' },
        { cmd: 30, subCmd: 1, label: 'B.a' },
      ]),
      /重复路由.*cmd=30 subCmd=1.*A\.a.*B\.a/,
    );
  });
});
