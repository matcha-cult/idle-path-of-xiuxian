/**
 * `MapLabTravelCard` 单测 —— 移动的**唯一规范路径**（§12.1：点击枢纽只选中）。
 *
 * 断言口径：按钮文案由 `travelDecision` 决定；`blocked` 一律**不可点**并说明原因；
 * 移动中只有目标节点那颗按钮 loading，其余只禁用（避免"点一下全面板转圈"）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeNode } from '../../../test/helpers/map-lab-fixtures.js';
import { MapLabTravelCard } from './MapLabTravelCard.js';
import { travelDecision } from './waypoint-gate.js';

const none: ReadonlySet<string> = new Set<string>();

function renderWith(over: {
  node?: ReturnType<typeof makeNode>;
  currentCode?: string | null;
  unlocked?: ReadonlySet<string>;
  moving?: boolean;
  movingTo?: string | null;
  onTravel?: (code: string, kind: never) => void;
}) {
  const node = over.node ?? makeNode({ adjacent: true });
  const onTravel = over.onTravel ?? vi.fn();
  render(
    <MapLabTravelCard
      node={node}
      decision={travelDecision(node, over.currentCode ?? null, over.unlocked ?? none)}
      moving={over.moving ?? false}
      movingTo={over.movingTo ?? null}
      onTravel={onTravel as never}
    />,
  );
  return onTravel;
}

describe('walk（相邻）', () => {
  it('按钮写「前往此地」且可点，回调 kind=walk', () => {
    const onTravel = vi.fn();
    renderWith({ node: makeNode({ code: 'qy_gate_n', adjacent: true }), onTravel: onTravel as never });
    const button = screen.getByTestId('map-lab-travel-action');
    expect(button).toHaveTextContent('前往此地');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onTravel).toHaveBeenCalledWith('qy_gate_n', 'walk');
  });
});

describe('teleport（传送点已点亮）', () => {
  it('按钮写「传送至此」，回调 kind=teleport', () => {
    const onTravel = vi.fn();
    renderWith({
      node: makeNode({ code: 'qy_gate_s', adjacent: false, hasWaypoint: true }),
      currentCode: 'qy_gate_n',
      unlocked: new Set(['qy_gate_s']),
      onTravel: onTravel as never,
    });
    const button = screen.getByTestId('map-lab-travel-action');
    expect(button).toHaveTextContent('传送至此');
    fireEvent.click(button);
    expect(onTravel).toHaveBeenCalledWith('qy_gate_s', 'teleport');
  });
});

describe('blocked（未交互的传送点 / 没有传送点）', () => {
  it('⭐ 按钮禁用 + 说明「需先交互」，点击不产生任何动作', () => {
    const onTravel = vi.fn();
    renderWith({
      node: makeNode({ code: 'qy_gate_s', adjacent: false, hasWaypoint: true }),
      currentCode: 'qy_gate_n',
      onTravel: onTravel as never,
    });
    const button = screen.getByTestId('map-lab-travel-action');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('暂不可前往');
    expect(screen.getByTestId('map-lab-travel-card')).toHaveTextContent('需先在此地与传送点交互');
    fireEvent.click(button);
    expect(onTravel).not.toHaveBeenCalled();
  });

  it('没有传送点且不相邻 → 提示与「没交互」区分开', () => {
    renderWith({ node: makeNode({ adjacent: false, hasWaypoint: false }), currentCode: 'qy_gate_n' });
    expect(screen.getByTestId('map-lab-travel-card')).toHaveTextContent('此处没有传送点');
  });
});

describe('here（已在原地）', () => {
  it('按钮禁用并写「已在原地」', () => {
    renderWith({ node: makeNode({ code: 'qy_gate_e' }), currentCode: 'qy_gate_e' });
    const button = screen.getByTestId('map-lab-travel-action');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('已在原地');
  });
});

describe('移动中（按钮级反馈，面板不卸载）', () => {
  it('目标节点的那颗按钮 loading', () => {
    renderWith({
      node: makeNode({ code: 'qy_gate_n', adjacent: true }),
      moving: true,
      movingTo: 'qy_gate_n',
    });
    expect(screen.getByTestId('map-lab-travel-action').className).toContain('ant-btn-loading');
  });

  it('正在前往别处时，本按钮只禁用不 loading', () => {
    renderWith({
      node: makeNode({ code: 'qy_gate_n', adjacent: true }),
      moving: true,
      movingTo: 'qy_gate_other',
    });
    const button = screen.getByTestId('map-lab-travel-action');
    expect(button).toBeDisabled();
    expect(button.className).not.toContain('ant-btn-loading');
  });
});
