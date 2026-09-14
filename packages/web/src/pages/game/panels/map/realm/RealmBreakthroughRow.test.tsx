/**
 * RealmBreakthroughRow：未突破 / 已突破 / 特殊秘境禁用 / 点击回调 / loading 落按钮。
 *
 * 口径：突破**不校验境界与战力**（§22 Q3），所以这里只测「要不要道具」这一条禁用原因。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ZoneBreakthroughView } from '@idle-path/ionet-transport';
import { RealmBreakthroughRow } from './RealmBreakthroughRow.js';

function entry(overrides: Partial<ZoneBreakthroughView> = {}): ZoneBreakthroughView {
  return {
    code: 'zone_r1',
    name: '青云山脚',
    realm: 1,
    tierKind: 'training',
    canBreakthrough: true,
    lockReason: 'ok',
    unlockItemCode: null,
    cleared: false,
    clears: 0,
    bestFloor: 0,
    maxFloor: 3,
    basePower: 15,
    powerStep: 12,
    ...overrides,
  };
}

describe('RealmBreakthroughRow · 通行（免费历练秘境）', () => {
  it('未突破 → 「未突破」+ 按钮文案「突破」且可点', () => {
    render(<RealmBreakthroughRow entry={entry()} busy={false} onBreakthrough={vi.fn()} />);

    expect(screen.getByText('青云山脚')).toBeInTheDocument();
    expect(screen.getByText('第 1 境')).toBeInTheDocument();
    expect(screen.getByText('历练秘境')).toBeInTheDocument();
    expect(screen.getByTestId('realm-locked-zone_r1')).toHaveTextContent('未突破');
    expect(screen.getByTestId('realm-breakthrough-zone_r1')).toBeEnabled();
    // ⚠️ antd 会在**两个汉字**之间自动插一个空格（"突 破"），断言必须容忍它；
    // 四条汉字的文案（如「再打一轮」）不受影响。
    expect(screen.getByTestId('realm-breakthrough-zone_r1')).toHaveTextContent(/突\s*破/);
  });

  it('已突破 → 「已突破 · N 轮」+ 按钮文案「再打一轮」（§22 可重复挑战）', () => {
    render(
      <RealmBreakthroughRow entry={entry({ cleared: true, clears: 3 })} busy={false} onBreakthrough={vi.fn()} />,
    );

    expect(screen.getByTestId('realm-cleared-zone_r1')).toHaveTextContent('已突破 · 3 轮');
    expect(screen.getByTestId('realm-breakthrough-zone_r1')).toHaveTextContent('再打一轮');
    expect(screen.getByTestId('realm-breakthrough-zone_r1')).toBeEnabled();
  });

  it('点击「突破」→ 回调收到该秘境 code', async () => {
    const onBreakthrough = vi.fn();
    render(<RealmBreakthroughRow entry={entry()} busy={false} onBreakthrough={onBreakthrough} />);

    await userEvent.click(screen.getByTestId('realm-breakthrough-zone_r1'));

    expect(onBreakthrough).toHaveBeenCalledTimes(1);
    expect(onBreakthrough).toHaveBeenCalledWith('zone_r1');
  });

  it('busy → 按钮进入 loading（反馈只落按钮）', () => {
    render(<RealmBreakthroughRow entry={entry()} busy onBreakthrough={vi.fn()} />);

    expect(screen.getByTestId('realm-breakthrough-zone_r1').className).toContain('ant-btn-loading');
  });
});

describe('RealmBreakthroughRow · 特殊秘境（需道具）', () => {
  it('canBreakthrough=false → 按钮禁用，标签为特殊秘境', () => {
    render(
      <RealmBreakthroughRow
        entry={entry({
          code: 'zone_r6',
          name: '地脉深窟',
          realm: 6,
          tierKind: 'special',
          canBreakthrough: false,
          lockReason: 'item_required',
          unlockItemCode: 'item_mijingling_r6',
        })}
        busy={false}
        onBreakthrough={vi.fn()}
      />,
    );

    expect(screen.getByText('特殊秘境')).toBeInTheDocument();
    expect(screen.getByTestId('realm-breakthrough-zone_r6')).toBeDisabled();
  });

  it('禁用时点击不触发回调（不会「点一下送人头」）', async () => {
    const onBreakthrough = vi.fn();
    render(
      <RealmBreakthroughRow
        entry={entry({ code: 'zone_r6', tierKind: 'special', canBreakthrough: false, lockReason: 'item_required' })}
        busy={false}
        onBreakthrough={onBreakthrough}
      />,
    );

    await userEvent.click(screen.getByTestId('realm-breakthrough-zone_r6'));

    expect(onBreakthrough).not.toHaveBeenCalled();
  });

  it('道具 code 原文不上屏（只提示「需特殊道具」）', () => {
    render(
      <RealmBreakthroughRow
        entry={entry({
          code: 'zone_r6',
          tierKind: 'special',
          canBreakthrough: false,
          lockReason: 'item_required',
          unlockItemCode: 'item_mijingling_r6',
        })}
        busy={false}
        onBreakthrough={vi.fn()}
      />,
    );

    expect(screen.queryByText(/item_mijingling_r6/)).not.toBeInTheDocument();
  });
});