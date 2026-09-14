/**
 * IdleTargetBar 测试（§23 ①）：挂机点状态与入口按钮的四种组合 + 点击回调。
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createPanelHarness } from '../../../../../test/helpers/panel-harness.js';
import { IdleTargetBar } from './IdleTargetBar.js';

function render(props: Partial<Parameters<typeof IdleTargetBar>[0]> = {}) {
  const onOpenPicker = vi.fn();
  const harness = createPanelHarness();
  harness.render(
    <IdleTargetBar
      targetName={null}
      availableCount={2}
      paused={false}
      onOpenPicker={onOpenPicker}
      {...props}
    />,
  );
  return { onOpenPicker };
}

describe('IdleTargetBar', () => {
  it('未设置：显示「未设置挂机点」+「选择挂机点」', () => {
    render();
    expect(screen.getByTestId('idle-target-state')).toHaveTextContent('未设置挂机点');
    expect(screen.getByTestId('idle-target-pick')).toHaveTextContent('选择挂机点');
    expect(screen.queryByTestId('idle-target-paused')).toBeNull();
  });

  it('已设置：显示挂机点名 +「更换挂机点」', () => {
    render({ targetName: '青云山' });
    expect(screen.getByTestId('idle-target-state')).toHaveTextContent('挂机点：青云山');
    expect(screen.getByTestId('idle-target-pick')).toHaveTextContent('更换挂机点');
  });

  it('在线战斗中：额外给出「已暂停」标签', () => {
    render({ targetName: '青云山', paused: true });
    expect(screen.getByTestId('idle-target-paused')).toHaveTextContent('已暂停');
  });

  it('点按钮触发 onOpenPicker', async () => {
    const { onOpenPicker } = render({ targetName: '青云山' });
    await userEvent.click(screen.getByTestId('idle-target-pick'));
    expect(onOpenPicker).toHaveBeenCalledTimes(1);
  });

  it('边界：可挂机秘境为 0 时按钮禁用（前端不给必败入口）', () => {
    render({ availableCount: 0 });
    expect(screen.getByTestId('idle-target-pick')).toBeDisabled();
  });

  it('边界：availableCount 为负数同样禁用', () => {
    render({ availableCount: -1 });
    expect(screen.getByTestId('idle-target-pick')).toBeDisabled();
  });
});
