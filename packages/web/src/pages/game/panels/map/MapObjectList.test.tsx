/**
 * MapObjectList 单测（P2.0 §3）：一院多职能的明细列表。
 *
 * 关键口径：已实现系统只给「已开放」标签（不伪造动作）；未实现系统统一走 `FeatureGate`；
 * 协议 `code` / `featureKey` 原文不上屏。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MapObjectView } from '@idle-path/ionet-transport';
import { MapObjectList } from './MapObjectList.js';

function makeObject(overrides: Partial<MapObjectView> = {}): MapObjectView {
  return {
    id: 1,
    code: 'obj_x',
    nodeCode: 'qy_baigongyuan',
    kind: 'office',
    name: '某堂',
    featureKey: 'alchemy',
    description: null,
    orderIndex: 1,
    ...overrides,
  };
}

describe('MapObjectList · 空态', () => {
  it('没有对象时给出空态提示，不渲染 FeatureGate', () => {
    render(<MapObjectList objects={[]} hostCode="n_1" />);
    expect(screen.getByTestId('map-objects-empty-n_1')).toHaveTextContent('暂无职能入口');
    expect(screen.queryByTestId('feature-gate')).toBeNull();
  });
});

describe('MapObjectList · 一院多职能', () => {
  const DANXIA = makeObject({
    id: 1,
    code: 'obj_danxiayuan',
    name: '丹霞院',
    featureKey: 'alchemy',
    description: '炉火整日不熄。',
  });
  const BAIQIGE = makeObject({ id: 2, code: 'obj_baiqige', name: '百器阁', featureKey: 'craft', orderIndex: 2 });
  const OBJECTS = [DANXIA, BAIQIGE];

  it('百工院列出「丹霞院 / 百器阁」两项，顺序沿用入参', () => {
    render(<MapObjectList objects={OBJECTS} hostCode="qy_baigongyuan" />);
    const list = screen.getByTestId('map-objects-qy_baigongyuan');
    expect(list).toHaveTextContent('丹霞院');
    expect(list).toHaveTextContent('百器阁');
    expect(list.textContent?.indexOf('丹霞院')).toBeLessThan(list.textContent?.indexOf('百器阁') ?? -1);
  });

  it('未实现系统（炼丹）走 FeatureGate：未开放 + 入口禁用', () => {
    render(<MapObjectList objects={OBJECTS} hostCode="qy_baigongyuan" />);
    expect(screen.getByTestId('feature-gate')).toHaveTextContent('未开放');
    expect(screen.getByTestId('map-object-entry-obj_danxiayuan')).toBeDisabled();
    expect(screen.queryByTestId('map-object-open-obj_danxiayuan')).toBeNull();
  });

  it('已实现系统（炼器）给「已开放」标签，不渲染未开放门', () => {
    render(<MapObjectList objects={[BAIQIGE]} hostCode="qy_baigongyuan" />);
    expect(screen.getByTestId('map-object-open-obj_baiqige')).toHaveTextContent('已开放');
    expect(screen.getByTestId('map-object-open-obj_baiqige')).toHaveTextContent('炼器');
    expect(screen.queryByTestId('feature-gate')).toBeNull();
  });

  it('风味文案渲染；为空时不渲染', () => {
    render(<MapObjectList objects={OBJECTS} hostCode="h" />);
    expect(screen.getByTestId('map-object-obj_danxiayuan')).toHaveTextContent('炉火整日不熄。');
    expect(screen.getByTestId('map-object-obj_baiqige')).not.toHaveTextContent('炉火');
  });

  it('未知 featureKey 走兜底名「此地系统」，且不上屏协议原文', () => {
    render(<MapObjectList objects={[makeObject({ code: 'obj_o', featureKey: 'weird' })]} hostCode="h" />);
    expect(screen.getByTestId('feature-gate')).toHaveTextContent('此地系统');
    expect(screen.queryByText('weird')).toBeNull();
  });

  it('featureKey=null 的对象也走兜底（不崩）', () => {
    render(<MapObjectList objects={[makeObject({ code: 'obj_n', featureKey: null })]} hostCode="h" />);
    expect(screen.getByTestId('feature-gate')).toHaveTextContent('此地系统');
  });

  it('协议 code 不上屏（只做 testid）', () => {
    render(<MapObjectList objects={[makeObject()]} hostCode="h" />);
    expect(screen.getByTestId('map-objects-h').textContent).not.toContain('obj_x');
  });
});
