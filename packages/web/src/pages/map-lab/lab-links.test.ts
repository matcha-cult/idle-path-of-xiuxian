/**
 * `lab-links` 单测 —— 连线高亮口径（与旧 `MapCanvas` 的 `linkState` 同口径）。
 */
import { describe, expect, it } from 'vitest';
import { makeEdge } from '../../../test/helpers/map-lab-fixtures.js';
import { linkStateOf } from './lab-links.js';

const EDGE = makeEdge('qy_gate_n', 'qy_approach');

describe('linkStateOf', () => {
  it('聚焦集合为空 → normal（没有选中也没有当前位置时不乱高亮）', () => {
    expect(linkStateOf(EDGE, [])).toBe('normal');
    expect(linkStateOf(EDGE, [null, null])).toBe('normal');
  });

  it('边的任一端是选中 / 当前所在 → active', () => {
    expect(linkStateOf(EDGE, ['qy_gate_n', null])).toBe('active');
    expect(linkStateOf(EDGE, [null, 'qy_approach'])).toBe('active');
    expect(linkStateOf(EDGE, ['qy_approach'])).toBe('active');
  });

  it('与焦点无关的边 → normal', () => {
    expect(linkStateOf(EDGE, ['qy_gate_s'])).toBe('normal');
  });

  it('null 混在集合里不会把任何边点亮（filter 掉 null 后为空）', () => {
    expect(linkStateOf(EDGE, [null])).toBe('normal');
  });
});
