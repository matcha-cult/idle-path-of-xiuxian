/**
 * `MapLabRightColumn` 单测 —— 右栏的**组成与条件渲染**（判定逻辑在 `waypoint-gate.ts`，这里只验接线）。
 *
 * 三条边界：`selected = null`（图里还没数据）时不该渲染任何动作面；传送点交互区与移动按钮
 * 只对选中地点出现；秘境石台只在 `featureKey=realm` 的地点上挂出。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createPanelHarness } from '../../../test/helpers/panel-harness.js';
import { makeNode, makeObject } from '../../../test/helpers/map-lab-fixtures.js';
import { buildLabObjects } from './lab-objects.js';
import { MapLabRightColumn } from './MapLabRightColumn.js';

const none: ReadonlySet<string> = new Set<string>();

function renderColumn(over: Partial<Parameters<typeof MapLabRightColumn>[0]> = {}) {
  const objects = over.objects ?? buildLabObjects([makeNode()], [makeObject()], none);
  const props = {
    objects,
    selected: makeNode() as ReturnType<typeof makeNode> | null,
    currentCode: 'qy_gate_e',
    unlocked: none,
    moving: false,
    movingTo: null,
    onFocusNode: vi.fn(),
    onInteract: vi.fn(),
    onTravel: vi.fn(),
    ...over,
  };
  render(<MapLabRightColumn {...props} />);
  return props;
}

describe('组成', () => {
  it('图例 + 对象清单始终在（右栏的「全图可交互对象」是常驻的）', () => {
    renderColumn();
    expect(screen.getByTestId('map-lab-right-column')).toBeInTheDocument();
    expect(screen.getByTestId('map-lab-object-list')).toBeInTheDocument();
  });

  it('选中地点存在时：传送点交互区 + 移动卡都渲染', () => {
    renderColumn();
    expect(screen.getByTestId('map-lab-waypoint-card')).toHaveAttribute('data-state', 'ready');
    expect(screen.getByTestId('map-lab-travel-card')).toHaveAttribute('data-kind', 'here');
  });

  it('⭐ selected = null（图还没数据）→ 不渲染任何动作面，但清单仍在', () => {
    renderColumn({ selected: null, objects: [] });
    expect(screen.queryByTestId('map-lab-waypoint-card')).toBeNull();
    expect(screen.queryByTestId('map-lab-travel-card')).toBeNull();
    expect(screen.queryByTestId('realm-stone-section')).toBeNull();
    expect(screen.getByTestId('map-lab-objects-empty')).toBeInTheDocument();
  });
});

describe('秘境石台的条件挂载', () => {
  it('featureKey=realm 的地点 → 挂出秘境石台交互区（该子组件读 store，须经 harness 提供 provider）', () => {
    const realm = makeNode({ code: 'qy_houshan', name: '第八峰·后山', featureKey: 'realm' });
    createPanelHarness().render(
      <MapLabRightColumn
        objects={buildLabObjects([realm], [], none)}
        selected={realm}
        currentCode="qy_gate_e"
        unlocked={none}
        moving={false}
        movingTo={null}
        onFocusNode={vi.fn()}
        onInteract={vi.fn()}
        onTravel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('realm-stone-section')).toBeInTheDocument();
  });

  it('普通地点 → 不挂出（不把秘境入口摊到每个地点上）', () => {
    renderColumn({ selected: makeNode({ featureKey: 'skill' }) });
    expect(screen.queryByTestId('realm-stone-section')).toBeNull();
  });
});

describe('回调接线', () => {
  it('点对象行 → onFocusNode(宿主节点 code)（只移焦点）', () => {
    const props = renderColumn();
    fireEvent.click(screen.getByTestId('map-lab-object-focus-obj_cangjingge'));
    expect(props.onFocusNode).toHaveBeenCalledWith('qy_gate_e');
  });

  it('点「与传送点交互」→ onInteract(节点 code)', () => {
    const props = renderColumn();
    fireEvent.click(screen.getByTestId('map-lab-waypoint-interact'));
    expect(props.onInteract).toHaveBeenCalledWith('qy_gate_e');
  });

  it('移动中：目标节点的按钮 loading，其余只禁用（按钮级反馈，面板不卸载）', () => {
    renderColumn({
      selected: makeNode({ code: 'qy_gate_n', name: '北门', adjacent: true }),
      currentCode: 'qy_gate_e',
      moving: true,
      movingTo: 'qy_gate_n',
    });
    expect(screen.getByTestId('map-lab-travel-action').className).toContain('ant-btn-loading');
    // 面板内容全程在（旧面板踩过「点前往白屏」）
    expect(screen.getByTestId('map-lab-object-list')).toBeInTheDocument();
  });

  it('已点亮的传送点 → 交互卡显示「已点亮」，不再给按钮', () => {
    renderColumn({ unlocked: new Set(['qy_gate_e']) });
    expect(screen.getByTestId('map-lab-waypoint-done')).toHaveTextContent('已点亮');
    expect(screen.queryByTestId('map-lab-waypoint-interact')).toBeNull();
  });
});
