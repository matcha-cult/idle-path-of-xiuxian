/**
 * `pointer-gestures` 单测 —— 抬手判定是**双击 / 轻点 / 拖动**三条路径的分叉点，
 * 也是最容易写错的地方，因此这里逐条打边界：
 * 恰好落在双击窗口上、两次落点相距恰好等于阈值、前后点的是不同枢纽、拖动后第一下仍算「第一下」。
 */
import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD_PX } from '../GraphCanvas/geometry.js';
import { DOUBLE_CLICK_MS } from '../GraphCanvas/use-graph-viewport.js';
import { pairGeometry, resolvePointerUp } from './pointer-gestures.js';
import type { PickMemory, PointerUpInput } from './pointer-gestures.js';

const fresh: PickMemory = { key: '', at: 0, x: 0, y: 0 };

const input = (over: Partial<PointerUpInput> = {}): PointerUpInput => ({
  moved: false,
  targetKey: null,
  memory: fresh,
  now: 1_000,
  x: 100,
  y: 100,
  zoomFactor: 2,
  ...over,
});

describe('拖动优先于一切', () => {
  it('越过阈值 → coast，且**不改记忆**（拖动后第一下轻点仍算第一下）', () => {
    const memory: PickMemory = { key: 'a', at: 900, x: 100, y: 100 };
    const decided = resolvePointerUp(input({ moved: true, targetKey: 'a', memory, now: 1_000 }));
    expect(decided.outcome).toEqual({ kind: 'coast' });
    expect(decided.memory).toBe(memory);
  });
});

describe('枢纽：单击只选中 / 双击快捷移动', () => {
  it('第一次轻点 → tap', () => {
    const decided = resolvePointerUp(input({ targetKey: 'qy_gate_n' }));
    expect(decided.outcome).toEqual({ kind: 'item', key: 'qy_gate_n', source: 'tap' });
  });

  it('同一枢纽、窗口内第二次 → double', () => {
    const memory: PickMemory = { key: 'qy_gate_n', at: 1_000, x: 100, y: 100 };
    const decided = resolvePointerUp(input({ targetKey: 'qy_gate_n', memory, now: 1_000 + DOUBLE_CLICK_MS }));
    expect(decided.outcome).toEqual({ kind: 'item', key: 'qy_gate_n', source: 'double' });
  });

  it('间隔超过窗口 → 退回 tap（边界：窗口 +1ms）', () => {
    const memory: PickMemory = { key: 'qy_gate_n', at: 1_000, x: 100, y: 100 };
    const decided = resolvePointerUp(
      input({ targetKey: 'qy_gate_n', memory, now: 1_000 + DOUBLE_CLICK_MS + 1 }),
    );
    expect(decided.outcome).toEqual({ kind: 'item', key: 'qy_gate_n', source: 'tap' });
  });

  it('先后点**不同**枢纽 → 都是 tap（不能跨枢纽凑成双击）', () => {
    const memory: PickMemory = { key: 'qy_gate_e', at: 1_000, x: 100, y: 100 };
    const decided = resolvePointerUp(input({ targetKey: 'qy_gate_s', memory, now: 1_010 }));
    expect(decided.outcome).toEqual({ kind: 'item', key: 'qy_gate_s', source: 'tap' });
  });

  it('同一枢纽但窗口内落点相距超阈值 → 退回 tap（手抖不算双击）', () => {
    const memory: PickMemory = { key: 'qy_gate_n', at: 1_000, x: 100, y: 100 };
    const decided = resolvePointerUp(
      input({ targetKey: 'qy_gate_n', memory, now: 1_010, x: 100 + DRAG_THRESHOLD_PX + 1, y: 100 }),
    );
    expect(decided.outcome).toEqual({ kind: 'item', key: 'qy_gate_n', source: 'tap' });
  });
});

describe('空白：单击关闭 / 双击放大', () => {
  it('第一次点空白 → background', () => {
    expect(resolvePointerUp(input()).outcome).toEqual({ kind: 'background' });
  });

  it('空白双击（同一点）→ zoom，倍率来自入参', () => {
    const memory: PickMemory = { key: '', at: 1_000, x: 100, y: 100 };
    const decided = resolvePointerUp(input({ memory, now: 1_020, zoomFactor: 2 }));
    expect(decided.outcome).toEqual({ kind: 'zoom', factor: 2 });
  });

  it('空白双击但落点相距超阈值 → 仍是 background（在图上划了两下不该放大）', () => {
    const memory: PickMemory = { key: '', at: 1_000, x: 100, y: 100 };
    const decided = resolvePointerUp(input({ memory, now: 1_020, x: 300, y: 300 }));
    expect(decided.outcome).toEqual({ kind: 'background' });
  });

  it('枢纽轻点之后紧接着点空白 → background（key 不同，不凑成双击）', () => {
    const memory: PickMemory = { key: 'qy_gate_n', at: 1_000, x: 100, y: 100 };
    expect(resolvePointerUp(input({ memory, now: 1_010 })).outcome).toEqual({ kind: 'background' });
  });
});

describe('记忆更新', () => {
  it('轻点后记忆写入目标与落点（供下一次双击判定）', () => {
    const decided = resolvePointerUp(input({ targetKey: 'a', now: 5_000, x: 7, y: 8 }));
    expect(decided.memory).toEqual({ key: 'a', at: 5_000, x: 7, y: 8 });
  });

  it('空白轻点把 key 记为**空串**（不是 null，保证下次比较稳定）', () => {
    expect(resolvePointerUp(input({ now: 5_000 })).memory.key).toBe('');
  });
});

describe('pairGeometry（双指几何）', () => {
  it('两指 → 距离与中心', () => {
    expect(pairGeometry([{ x: 0, y: 0 }, { x: 30, y: 40 }])).toEqual({
      distance: 50,
      centerX: 15,
      centerY: 20,
    });
  });

  it('少于两指 → null（捏合判定不成立）', () => {
    expect(pairGeometry([])).toBeNull();
    expect(pairGeometry([{ x: 1, y: 2 }])).toBeNull();
  });

  it('只取前两指（三指按下也不会算出错误的中心）', () => {
    const pair = pairGeometry([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 999, y: 999 }]);
    expect(pair).toEqual({ distance: 10, centerX: 5, centerY: 0 });
  });
});
