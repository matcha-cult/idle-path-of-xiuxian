/**
 * `MapLabObjectPanel` 单测 —— 右栏「本图可交互对象」总表。
 *
 * 这是用户形态要求里「**右边地图内可交互对象**」的落点，断言：
 * 分类计数、分组顺序、空组不渲染、空态、以及行点击能透传焦点回调。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LabObject } from './lab-objects.js';
import { MapLabObjectPanel } from './MapLabObjectPanel.js';

const WAYPOINT: LabObject = {
  key: 'wp:qy_gate_n',
  kind: 'waypoint',
  name: '北门传送点',
  nodeCode: 'qy_gate_n',
  nodeName: '北门',
  description: null,
  featureKey: 'waypoint',
  done: true,
};
const REALM: LabObject = {
  key: 'realm:qy_houshan',
  kind: 'realm',
  name: '第八峰·后山 · 秘境石台',
  nodeCode: 'qy_houshan',
  nodeName: '第八峰·后山',
  description: null,
  featureKey: 'realm',
  done: false,
};
const OFFICE: LabObject = {
  key: 'obj_cangjingge',
  kind: 'office',
  name: '藏经阁',
  nodeCode: 'qy_chuanfayuan',
  nodeName: '传法院',
  description: null,
  featureKey: 'skill',
  done: false,
};

describe('MapLabObjectPanel', () => {
  it('标题下给出三类计数', () => {
    render(
      <MapLabObjectPanel
        objects={[WAYPOINT, REALM, OFFICE]}
        selectedNodeCode={null}
        onFocusNode={vi.fn()}
      />,
    );
    const panel = screen.getByTestId('map-lab-object-list').parentElement;
    expect(panel).toHaveTextContent('传送点 1');
    expect(panel).toHaveTextContent('秘境入口 1');
    expect(panel).toHaveTextContent('职能入口 1');
  });

  it('按「传送点 → 秘境入口 → 职能入口」分组展示', () => {
    render(
      <MapLabObjectPanel
        objects={[OFFICE, REALM, WAYPOINT]}
        selectedNodeCode={null}
        onFocusNode={vi.fn()}
      />,
    );
    const groups = ['waypoint', 'realm', 'office'].map((kind) =>
      screen.getByTestId(`map-lab-group-${kind}`),
    );
    // DOM 顺序即展示顺序
    expect(groups[0]?.compareDocumentPosition(groups[1] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(groups[1]?.compareDocumentPosition(groups[2] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('空的分组不渲染（不出现空白小标题）', () => {
    render(<MapLabObjectPanel objects={[OFFICE]} selectedNodeCode={null} onFocusNode={vi.fn()} />);
    expect(screen.queryByTestId('map-lab-group-waypoint')).toBeNull();
    expect(screen.queryByTestId('map-lab-group-realm')).toBeNull();
    expect(screen.getByTestId('map-lab-group-office')).toBeInTheDocument();
  });

  it('空列表 → 空态提示，不渲染列表', () => {
    render(<MapLabObjectPanel objects={[]} selectedNodeCode={null} onFocusNode={vi.fn()} />);
    expect(screen.getByTestId('map-lab-objects-empty')).toHaveTextContent('本图暂无可交互对象');
    expect(screen.queryByTestId('map-lab-object-list')).toBeNull();
  });

  it('行点击把宿主节点 code 透传给容器（只移焦点）', () => {
    const onFocusNode = vi.fn();
    render(
      <MapLabObjectPanel objects={[OFFICE]} selectedNodeCode={null} onFocusNode={onFocusNode} />,
    );
    fireEvent.click(screen.getByTestId('map-lab-object-focus-obj_cangjingge'));
    expect(onFocusNode).toHaveBeenCalledWith('qy_chuanfayuan');
  });

  it('选中节点相同的行带「此处」标记', () => {
    render(
      <MapLabObjectPanel
        objects={[WAYPOINT, OFFICE]}
        selectedNodeCode="qy_gate_n"
        onFocusNode={vi.fn()}
      />,
    );
    expect(screen.getByTestId('map-lab-object-here-wp:qy_gate_n')).toBeInTheDocument();
    expect(screen.queryByTestId('map-lab-object-here-obj_cangjingge')).toBeNull();
  });
});
