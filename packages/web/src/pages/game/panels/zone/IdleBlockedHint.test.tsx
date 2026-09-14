/**
 * IdleBlockedHint 测试（§23 ① G3）：三种「不能挂机 / 还没挂机」的原因 + 无需解释时不占版面。
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createPanelHarness } from '../../../../../test/helpers/panel-harness.js';
import { IdleBlockedHint } from './IdleBlockedHint.js';

function render(props: Partial<Parameters<typeof IdleBlockedHint>[0]> = {}) {
  const harness = createPanelHarness();
  harness.render(<IdleBlockedHint inBattle={false} availableCount={1} hasTarget {...props} />);
}

describe('IdleBlockedHint', () => {
  it('一切正常（有可选项 + 已设置 + 不在战斗）时不渲染', () => {
    const harness = createPanelHarness();
    harness.render(<IdleBlockedHint inBattle={false} availableCount={1} hasTarget />);
    expect(screen.queryByTestId('idle-blocked-hint')).toBeNull();
  });

  it('在线战斗中：解释「已暂停」并说明离开后恢复', () => {
    render({ inBattle: true, hasTarget: true });
    const hint = screen.getByTestId('idle-blocked-hint');
    expect(hint).toHaveTextContent('离线挂机已暂停');
    expect(hint).toHaveTextContent('离开秘境后自动恢复');
  });

  it('战斗中优先于「没有可挂机秘境」与「未设置」（状态闸门优先）', () => {
    render({ inBattle: true, availableCount: 0, hasTarget: false });
    expect(screen.getByTestId('idle-blocked-hint')).toHaveTextContent('离线挂机已暂停');
  });

  it('没有可挂机的秘境：指路到秘境石台，并说明特殊秘境不可挂机', () => {
    render({ availableCount: 0, hasTarget: false });
    const hint = screen.getByTestId('idle-blocked-hint');
    expect(hint).toHaveTextContent('暂无可挂机的秘境');
    expect(hint).toHaveTextContent('秘境石台');
    expect(hint).toHaveTextContent('特殊秘境不可挂机');
  });

  it('有可选项但未设置：提示先选一个挂机点', () => {
    render({ availableCount: 3, hasTarget: false });
    const hint = screen.getByTestId('idle-blocked-hint');
    expect(hint).toHaveTextContent('尚未设置挂机点');
    expect(hint).toHaveTextContent('离线收益才会按它结算');
  });

  it('边界：秘境域加载中不解释（避免把「正在加载」误读成「没有可挂机的秘境」）', () => {
    render({ availableCount: 0, hasTarget: false, loading: true });
    expect(screen.queryByTestId('idle-blocked-hint')).toBeNull();
  });

  it('边界：availableCount 为负数按「没有可挂机秘境」处理', () => {
    render({ availableCount: -3, hasTarget: false });
    expect(screen.getByTestId('idle-blocked-hint')).toHaveTextContent('暂无可挂机的秘境');
  });
});
