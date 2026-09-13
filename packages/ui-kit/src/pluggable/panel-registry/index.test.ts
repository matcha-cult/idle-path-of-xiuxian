/**
 * panel-registry：纯 TS 注册表。
 * 覆盖：注册/查询/size、重复键抛错、空键抛错、order 排序（含同 order 稳定）、
 * `list()` 快照不可变、unregister/clear、registerAll 原子性、初始列表。
 */
import { describe, expect, it } from 'vitest';
import { createPanelRegistry, type PanelTabItem } from './index.js';

/** 便捷构造：只关心 key/order 的测试条目。 */
function item(key: string, order?: number): PanelTabItem {
  return order === undefined ? { key, label: key } : { key, label: key, order };
}

describe('createPanelRegistry', () => {
  it('register/has/get/size/list：正常注册后可查询并列举', () => {
    const registry = createPanelRegistry();
    const cultivation = item('cultivation');
    registry.register(cultivation);

    expect(registry.has('cultivation')).toBe(true);
    expect(registry.get('cultivation')).toBe(cultivation);
    expect(registry.size).toBe(1);
    expect(registry.list()).toEqual([cultivation]);
  });

  it('register：重复 key 抛错，消息含 key，且不覆盖原条目', () => {
    const registry = createPanelRegistry();
    const first = item('bag');
    registry.register(first);

    expect(() => registry.register(item('bag'))).toThrow(/bag/);
    expect(registry.size).toBe(1);
    expect(registry.get('bag')).toBe(first);
  });

  it('register：空键与纯空白键抛错，且不改变内部状态', () => {
    const registry = createPanelRegistry();

    expect(() => registry.register(item(''))).toThrow(Error);
    expect(() => registry.register(item('   '))).toThrow(Error);
    expect(() => registry.register(item('\t\n'))).toThrow(Error);
    expect(registry.size).toBe(0);
    expect(registry.list()).toEqual([]);
  });

  it('list：按 order 升序（缺省 0），同 order 保持注册顺序稳定', () => {
    const registry = createPanelRegistry();
    // 注册顺序：b(0 缺省) → a(2) → d(0) → c(1)
    registry.register(item('b'));
    registry.register(item('a', 2));
    registry.register(item('d'));
    registry.register(item('c', 1));
    registry.register(item('e', -1));

    expect(registry.list().map((entry) => entry.key)).toEqual(['e', 'b', 'd', 'c', 'a']);
  });

  it('list：返回新数组快照，外部 push/splice 不影响内部', () => {
    const registry = createPanelRegistry([item('x'), item('y')]);

    const snapshot = registry.list();
    snapshot.push(item('injected'));
    snapshot.splice(0, snapshot.length);

    expect(registry.size).toBe(2);
    expect(registry.list().map((entry) => entry.key)).toEqual(['x', 'y']);
    expect(registry.has('injected')).toBe(false);
  });

  it('unregister：命中返回 true 并移除，未命中返回 false', () => {
    const registry = createPanelRegistry([item('x')]);

    expect(registry.unregister('x')).toBe(true);
    expect(registry.size).toBe(0);
    expect(registry.get('x')).toBeUndefined();
    expect(registry.unregister('x')).toBe(false);
    expect(registry.unregister('never-registered')).toBe(false);
  });

  it('clear：清空后 size/list/has 均为空态', () => {
    const registry = createPanelRegistry([item('x'), item('y')]);
    registry.clear();

    expect(registry.size).toBe(0);
    expect(registry.list()).toEqual([]);
    expect(registry.has('x')).toBe(false);
  });

  it('registerAll：批量注册生效；批内或与已有重复则整体不生效（先校验后写入）', () => {
    const registry = createPanelRegistry([item('existing')]);

    registry.registerAll([item('a', 1), item('b', 2)]);
    expect(registry.size).toBe(3);

    expect(() => registry.registerAll([item('c'), item('existing')])).toThrow(/existing/);
    expect(registry.has('c')).toBe(false);

    expect(() => registry.registerAll([item('d'), item('d')])).toThrow(/d/);
    expect(registry.has('d')).toBe(false);
    expect(registry.size).toBe(3);
  });

  it('createPanelRegistry：初始列表缺省不注册，实例之间状态隔离', () => {
    const empty = createPanelRegistry();
    const withInitial = createPanelRegistry([item('a'), item('b', 5)]);

    expect(empty.size).toBe(0);
    expect(withInitial.size).toBe(2);
    expect(withInitial.list().map((entry) => entry.key)).toEqual(['a', 'b']);

    withInitial.clear();
    expect(empty.size).toBe(0);
  });
});
