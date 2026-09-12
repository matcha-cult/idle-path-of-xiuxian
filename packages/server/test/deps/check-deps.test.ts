import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_DEPS,
  buildGraph,
  findCycles,
  findInternalLeaks,
  findLayerViolations,
  serverOf,
} from '../../scripts/lib/dep-rules.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

describe('serverOf 边界', () => {
  const cases: Array<[string, string | null]> = [
    ['modules/logic/item/item.action.ts', 'item'],
    ['modules/logic/item/internal/item.service.ts', 'item'],
    ['modules/game/item/item.service.ts', 'item'],
    ['modules/game/currency/craft.service.ts', 'economy'],
    ['modules/game/unit/unit.service.ts', 'combat'],
    ['modules/game/game-database.service.ts', null],
    ['modules/game/game.module.ts', null],
    ['common/kernel/effect.ts', null],
    ['ionet/cmd.ts', null],
    ['app.module.ts', null],
    ['modules/game/stat/stat.service.ts', null],
    ['', null],
    ['modules/logic', null],
    ['modules/game', null],
  ];
  for (const [input, expected] of cases) {
    test(`serverOf("${input}") -> ${String(expected)}`, () => {
      assert.equal(serverOf(input), expected);
    });
  }
});

describe('findCycles 边界', () => {
  test('空图 / 单节点自环', () => {
    assert.deepEqual(findCycles(new Map()), []);
    assert.equal(findCycles(new Map([['a', ['a']]])).length, 1);
  });
  test('无环返回空', () => {
    const graph = new Map([['a', ['b']], ['b', ['c']], ['c', []]]);
    assert.deepEqual(findCycles(graph), []);
  });
  test('二元环与三元环', () => {
    assert.equal(findCycles(new Map([['a', ['b']], ['b', ['a']]])).length, 1);
    assert.equal(findCycles(new Map([['a', ['b']], ['b', ['c']], ['c', ['a']]])).length, 1);
  });
  test('同一环不重复报告；多个独立环全部报告', () => {
    const graph = new Map([
      ['a', ['b']],
      ['b', ['a']],
      ['c', ['d']],
      ['d', ['c']],
    ]);
    assert.equal(findCycles(graph).length, 2);
  });
});

describe('findLayerViolations 边界', () => {
  test('允许的跨服依赖不报错', () => {
    const graph = new Map([['modules/logic/economy/x.ts', ['modules/logic/item/internal/item.service.ts']]]);
    assert.deepEqual(findLayerViolations(graph), []);
  });
  test('低层 import 高层 -> 报错', () => {
    const graph = new Map([['modules/logic/item/x.ts', ['modules/logic/economy/y.ts']]]);
    assert.equal(findLayerViolations(graph).length, 1);
  });
  test('同服内部与基础设施依赖不报错', () => {
    const graph = new Map([
      ['modules/logic/item/a.ts', ['modules/logic/item/b.ts']],
      ['modules/logic/item/b.ts', ['common/kernel/effect.ts', 'character/service.ts', 'modules/character/character.service.ts']],
    ]);
    assert.deepEqual(findLayerViolations(graph), []);
  });
  test('未登记的逻辑服目录被跳过', () => {
    const graph = new Map([['modules/logic/unknown/x.ts', ['modules/logic/item/y.ts']]]);
    assert.deepEqual(findLayerViolations(graph), []);
  });
  test('DAG 允许集合自反性与覆盖', () => {
    for (const [from, allowed] of Object.entries(ALLOWED_DEPS)) {
      assert.equal(allowed.includes(from), false, `${from} 不应依赖自身`);
      for (const dep of allowed) {
        assert.ok(dep in ALLOWED_DEPS, `${from} 依赖了未登记的 ${dep}`);
      }
    }
  });
});

describe('findInternalLeaks 边界', () => {
  test('跨服 internal 泄漏被发现', () => {
    const graph = new Map([['modules/logic/prop/x.ts', ['modules/logic/item/internal/item.service.ts']]]);
    assert.equal(findInternalLeaks(graph).length, 1);
  });
  test('同服 internal 与门面不算泄漏', () => {
    const graph = new Map([
      ['modules/logic/prop/x.ts', ['modules/logic/item/item.logic.service.ts']],
      ['modules/logic/item/a.ts', ['modules/logic/item/internal/b.ts']],
    ]);
    assert.deepEqual(findInternalLeaks(graph), []);
  });
});

describe('真实源码树（回归）', () => {
  const graph = buildGraph(SRC);
  test('无环', () => assert.deepEqual(findCycles(graph), []));
  test('无越层依赖', () => assert.deepEqual(findLayerViolations(graph), []));
  test('图非空', () => assert.ok(graph.size > 50));
});
