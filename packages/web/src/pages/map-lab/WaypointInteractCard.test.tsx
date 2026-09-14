/**
 * `WaypointInteractCard` 单测 —— 「与传送点交互」这个**机制的唯一入口**。
 *
 * 四条边界里最重要的一条是 `elsewhere`：**人不在该节点就不给按钮** ——
 * 否则可以在任意地方隔空点亮传送点，「跑图」退回成「经过」，机制就废了。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeNode } from '../../../test/helpers/map-lab-fixtures.js';
import { WaypointInteractCard } from './WaypointInteractCard.js';

const none: ReadonlySet<string> = new Set<string>();

describe('ready（人在此地 + 尚未点亮）', () => {
  it('给出交互按钮，点击回调宿主节点 code', () => {
    const onInteract = vi.fn();
    render(
      <WaypointInteractCard
        node={makeNode({ code: 'qy_gate_e' })}
        currentCode="qy_gate_e"
        unlocked={none}
        onInteract={onInteract}
      />,
    );
    fireEvent.click(screen.getByTestId('map-lab-waypoint-interact'));
    expect(onInteract).toHaveBeenCalledWith('qy_gate_e');
  });

  it('状态标记为 pending（未点亮），并说明交互的后果', () => {
    render(
      <WaypointInteractCard node={makeNode()} currentCode="qy_gate_e" unlocked={none} onInteract={vi.fn()} />,
    );
    expect(screen.getByTestId('map-lab-waypoint-pending')).toBeInTheDocument();
    expect(screen.getByTestId('map-lab-waypoint-card')).toHaveTextContent('之后可从任意地点传送至此');
  });
});

describe('elsewhere（人不在该节点）', () => {
  it('⭐ 不给交互按钮，只说明「需先到达此地」（防隔空点亮）', () => {
    render(
      <WaypointInteractCard
        node={makeNode({ code: 'qy_gate_s', adjacent: false })}
        currentCode="qy_gate_n"
        unlocked={none}
        onInteract={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('map-lab-waypoint-interact')).toBeNull();
    expect(screen.getByTestId('map-lab-waypoint-card')).toHaveTextContent('需先到达此地');
  });
});

describe('done（已点亮）', () => {
  it('换成「已点亮」标签，不再给按钮（重复交互无意义）', () => {
    render(
      <WaypointInteractCard
        node={makeNode()}
        currentCode="qy_gate_e"
        unlocked={new Set(['qy_gate_e'])}
        onInteract={vi.fn()}
      />,
    );
    expect(screen.getByTestId('map-lab-waypoint-done')).toBeInTheDocument();
    expect(screen.queryByTestId('map-lab-waypoint-interact')).toBeNull();
    expect(screen.queryByTestId('map-lab-waypoint-pending')).toBeNull();
  });
});

describe('none（此地没有传送点）', () => {
  it('不给按钮，也不说「未点亮」（避免玩家以为漏了什么）', () => {
    render(
      <WaypointInteractCard
        node={makeNode({ hasWaypoint: false })}
        currentCode="qy_gate_e"
        unlocked={none}
        onInteract={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('map-lab-waypoint-interact')).toBeNull();
    expect(screen.getByTestId('map-lab-waypoint-card')).toHaveTextContent('此地没有传送点');
  });
});

describe('协议字段不上屏', () => {
  it('不出现节点 code 原文', () => {
    render(
      <WaypointInteractCard node={makeNode()} currentCode="qy_gate_e" unlocked={none} onInteract={vi.fn()} />,
    );
    expect(screen.getByTestId('map-lab-waypoint-card').textContent).not.toContain('qy_gate_e');
  });
});
