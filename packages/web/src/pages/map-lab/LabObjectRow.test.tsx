/**
 * `LabObjectRow` 单测 —— 可交互对象列表的一行。
 *
 * 关键口径：点行**只把画布焦点移过去**（与「点击枢纽只选中」同一原则，先看再决定），
 * 不发起任何移动；kind 用中文展示（协议值不上屏）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LabObject } from './lab-objects.js';
import { LabObjectRow } from './LabObjectRow.js';

function makeLabObject(overrides: Partial<LabObject> = {}): LabObject {
  return {
    key: 'wp:qy_gate_n',
    kind: 'waypoint',
    name: '北门传送点',
    nodeCode: 'qy_gate_n',
    nodeName: '北门',
    description: null,
    featureKey: 'waypoint',
    done: false,
    ...overrides,
  };
}

describe('LabObjectRow', () => {
  it('展示中文名 + 中文 kind + 宿主地点名', () => {
    render(<LabObjectRow object={makeLabObject()} onSelectedNode={false} onFocusNode={vi.fn()} />);
    const row = screen.getByTestId('map-lab-object-wp:qy_gate_n');
    expect(row).toHaveTextContent('北门传送点');
    expect(row).toHaveTextContent('传送点');
    expect(row).toHaveTextContent('北门');
  });

  it('点击只移焦点（回调宿主节点 code），不是移动动作', () => {
    const onFocusNode = vi.fn();
    render(<LabObjectRow object={makeLabObject()} onSelectedNode={false} onFocusNode={onFocusNode} />);
    fireEvent.click(screen.getByTestId('map-lab-object-focus-wp:qy_gate_n'));
    expect(onFocusNode).toHaveBeenCalledWith('qy_gate_n');
  });

  it('已点亮的传送点带「已点亮」标记', () => {
    render(
      <LabObjectRow object={makeLabObject({ done: true })} onSelectedNode={false} onFocusNode={vi.fn()} />,
    );
    expect(screen.getByTestId('map-lab-object-done-wp:qy_gate_n')).toHaveTextContent('已点亮');
  });

  it('未点亮时不出现「已点亮」标记', () => {
    render(<LabObjectRow object={makeLabObject()} onSelectedNode={false} onFocusNode={vi.fn()} />);
    expect(screen.queryByTestId('map-lab-object-done-wp:qy_gate_n')).toBeNull();
  });

  it('属于当前选中地点 → 带「此处」标记（其余不带）', () => {
    const { rerender } = render(
      <LabObjectRow object={makeLabObject()} onSelectedNode onFocusNode={vi.fn()} />,
    );
    expect(screen.getByTestId('map-lab-object-here-wp:qy_gate_n')).toHaveTextContent('此处');
    rerender(<LabObjectRow object={makeLabObject()} onSelectedNode={false} onFocusNode={vi.fn()} />);
    expect(screen.queryByTestId('map-lab-object-here-wp:qy_gate_n')).toBeNull();
  });

  it('三类对象都用中文标签（协议 kind 原文不上屏）', () => {
    const kinds = [
      { kind: 'waypoint' as const, label: '传送点' },
      { kind: 'realm' as const, label: '秘境入口' },
      { kind: 'office' as const, label: '职能入口' },
    ];
    for (const { kind, label } of kinds) {
      const { unmount } = render(
        <LabObjectRow object={makeLabObject({ kind })} onSelectedNode={false} onFocusNode={vi.fn()} />,
      );
      expect(screen.getByTestId('map-lab-object-wp:qy_gate_n')).toHaveTextContent(label);
      unmount();
    }
  });
});
