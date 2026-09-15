/**
 * `MapStageObjectPanel` 单测 —— 断言"用户能看到什么、点了会怎样"，重点是那条门槛：
 * **未与传送点交互 ⇒ 传送按钮禁用且说明原因；交互后解锁**（北极星的门槛，别退化成默认可用）。
 *
 * 组件是受控的（选中态与已交互集合都由外部给），所以这些用例都在 rerender 里模拟页面状态变化。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapStageObjectPanel } from './MapStageObjectPanel.js';
import { MAP_OBJECTS } from './map-objects.js';
import { resolveMapPoints } from './map-points.js';

const POINTS = resolveMapPoints();
const NORTH_GATE = 'qy_gate_n'; // 北门（传送点，pointKey = gate_2）
const REALM = 'qy_peak_xunlian'; // 第八峰·后山（秘境入口）

function panel(over: Partial<React.ComponentProps<typeof MapStageObjectPanel>> = {}) {
  const props = {
    points: POINTS,
    selectedKey: null,
    interacted: [],
    onSelectPoint: vi.fn(),
    onInteract: vi.fn(),
    onTravel: vi.fn(),
    ...over,
  };
  const view = render(<MapStageObjectPanel {...props} />);
  return { ...props, rerender: (next: Partial<typeof props>) => view.rerender(<MapStageObjectPanel {...props} {...next} />) };
}

describe('加载与定位', () => {
  it('未选中点位 ⇒ 列出全部对象 + 总数 + 传送点数量提示', () => {
    panel();
    expect(screen.getByTestId('object-panel-count')).toHaveTextContent(`${MAP_OBJECTS.length} 个`);
    expect(screen.getByTestId('object-panel-hint')).toHaveTextContent('4 个传送点');
    for (const object of MAP_OBJECTS) expect(screen.getByTestId(`object-${object.key}`)).toBeTruthy();
    // 未选中时每行标出"在哪个点位"
    expect(screen.getByTestId(`object-${NORTH_GATE}`)).toHaveTextContent('在 宗门·北门');
  });

  it('⭐ 选中点位 ⇒ 只列这个点位的对象（北门上两个：传送点 + 占位 NPC）', () => {
    panel({ selectedKey: 'gate_2' });
    expect(screen.getByTestId('object-panel-selected')).toHaveTextContent('宗门·北门');
    expect(screen.getByTestId(`object-${NORTH_GATE}`)).toBeTruthy();
    expect(screen.getByTestId('object-qy_gate_n#npc')).toBeTruthy();
    expect(screen.queryByTestId(`object-${REALM}`)).toBeNull(); // 别的点位对象不混进来
  });

  it('⭐ 点对象名 ⇒ 反向选中它所在的点位（右边点 → 左边亮）', () => {
    const { onSelectPoint } = panel();
    fireEvent.click(screen.getByTestId(`object-goto-${REALM}`));
    expect(onSelectPoint).toHaveBeenLastCalledWith('peak_8');
  });

  it('点「取消选择」⇒ 回到全部对象', () => {
    const { onSelectPoint } = panel({ selectedKey: 'gate_2' });
    fireEvent.click(screen.getByTestId('object-panel-clear'));
    expect(onSelectPoint).toHaveBeenLastCalledWith(null);
  });

  it('这个点位没有对象 ⇒ 空态（不是白板）', () => {
    panel({ selectedKey: 'gate_2', objects: [] });
    expect(screen.getByText('这个点位没有可交互对象')).toBeTruthy();
  });

  it('notice 有值时显示（最近一次交互/传送的结果）', () => {
    panel({ notice: '已与 北门 交互' });
    expect(screen.getByTestId('object-panel-notice')).toHaveTextContent('已与 北门 交互');
  });
});

describe('交互 → 传送解锁（北极星的门槛）', () => {
  it('⭐ 未交互 ⇒ 传送禁用并说明原因；点「交互」把 key 报出去', () => {
    const { onInteract, onTravel } = panel({ selectedKey: 'gate_2' });
    expect(screen.getByTestId(`object-travel-${NORTH_GATE}`)).toBeDisabled();
    expect(screen.getByTestId(`object-locked-${NORTH_GATE}`)).toHaveTextContent('须先与传送点交互');
    expect(screen.queryByTestId(`object-done-${NORTH_GATE}`)).toBeNull();

    fireEvent.click(screen.getByTestId(`object-interact-${NORTH_GATE}`));
    expect(onInteract).toHaveBeenLastCalledWith(NORTH_GATE);
    expect(onTravel).not.toHaveBeenCalled();
  });

  it('⭐ 已交互 ⇒ 传送解锁可点；「交互」变已交互态（不再重复点）', () => {
    const { onTravel } = panel({ selectedKey: 'gate_2', interacted: [NORTH_GATE] });
    expect(screen.getByTestId(`object-done-${NORTH_GATE}`)).toHaveTextContent('已交互');
    expect(screen.getByTestId(`object-travel-${NORTH_GATE}`)).toBeEnabled();
    expect(screen.queryByTestId(`object-locked-${NORTH_GATE}`)).toBeNull();

    fireEvent.click(screen.getByTestId(`object-travel-${NORTH_GATE}`));
    expect(onTravel).toHaveBeenLastCalledWith(NORTH_GATE);
    expect(screen.getByTestId(`object-interact-${NORTH_GATE}`)).toBeDisabled();
  });

  it('只交互了**别的**传送点 ⇒ 这一座仍然锁着（门控按对象算，不按"有没有交互过"算）', () => {
    panel({ selectedKey: 'gate_2', interacted: ['qy_gate_e'] });
    expect(screen.getByTestId(`object-travel-${NORTH_GATE}`)).toBeDisabled();
  });

  it('非传送点没有传送按钮（秘境入口只给交互）', () => {
    panel({ selectedKey: 'peak_8', interacted: [REALM] });
    expect(screen.getByTestId(`object-${REALM}`)).toHaveTextContent('已交互');
    expect(screen.queryByTestId(`object-travel-${REALM}`)).toBeNull();
  });

  it('占位对象带「占位」标记（不假装后端已经有 NPC）', () => {
    panel({ selectedKey: 'gate_2' });
    expect(screen.getByTestId('object-placeholder-qy_gate_n#npc')).toHaveTextContent('占位');
  });
});
