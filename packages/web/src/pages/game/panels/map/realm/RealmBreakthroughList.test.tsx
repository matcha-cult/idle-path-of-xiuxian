/**
 * RealmBreakthroughList：空列表占位 / 逐行渲染与顺序 / busyCode 只作用于一行 / 点击透传。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ZoneBreakthroughView } from '@idle-path/ionet-transport';
import { RealmBreakthroughList } from './RealmBreakthroughList.js';

function entry(realm: number, overrides: Partial<ZoneBreakthroughView> = {}): ZoneBreakthroughView {
  return {
    code: `zone_r${realm}`,
    name: `第${realm}境秘境`,
    realm,
    tierKind: realm <= 5 ? 'training' : 'special',
    canBreakthrough: realm <= 5,
    lockReason: realm <= 5 ? 'ok' : 'item_required',
    unlockItemCode: realm <= 5 ? null : `item_mijingling_r${realm}`,
    cleared: false,
    clears: 0,
    bestFloor: 0,
    maxFloor: 3,
    basePower: 20 * realm - 5,
    powerStep: 12,
    ...overrides,
  };
}

describe('RealmBreakthroughList', () => {
  it('空列表 → 占位文案，不渲染空壳', () => {
    render(<RealmBreakthroughList entries={[]} busyCode={null} onBreakthrough={vi.fn()} />);

    expect(screen.getByTestId('realm-breakthrough-empty')).toHaveTextContent('暂无可突破的秘境');
    expect(screen.queryByTestId('realm-breakthrough-list')).not.toBeInTheDocument();
  });

  it('按传入顺序渲染每一行（服务端已按 realm 排序）', () => {
    render(
      <RealmBreakthroughList
        entries={[entry(1), entry(6)]}
        busyCode={null}
        onBreakthrough={vi.fn()}
      />,
    );

    const list = screen.getByTestId('realm-breakthrough-list');
    const rows = list.querySelectorAll('[data-testid^="realm-row-"]');
    expect(rows.length).toBe(2);
    expect(rows[0]).toHaveAttribute('data-testid', 'realm-row-zone_r1');
    expect(rows[1]).toHaveAttribute('data-testid', 'realm-row-zone_r6');
  });

  it('busyCode 只让对应那一行 loading，其余行不受影响', () => {
    render(
      <RealmBreakthroughList
        entries={[entry(1), entry(2)]}
        busyCode="zone_r2"
        onBreakthrough={vi.fn()}
      />,
    );

    expect(screen.getByTestId('realm-breakthrough-zone_r1').className).not.toContain('ant-btn-loading');
    expect(screen.getByTestId('realm-breakthrough-zone_r2').className).toContain('ant-btn-loading');
  });

  it('点击某一行 → 回调收到该行 code（不串行）', async () => {
    const onBreakthrough = vi.fn();
    render(
      <RealmBreakthroughList entries={[entry(1), entry(2)]} busyCode={null} onBreakthrough={onBreakthrough} />,
    );

    await userEvent.click(screen.getByTestId('realm-breakthrough-zone_r2'));

    expect(onBreakthrough).toHaveBeenCalledTimes(1);
    expect(onBreakthrough).toHaveBeenCalledWith('zone_r2');
  });

  it('服务端把某行判为不可突破（道具未齐）→ 该行按钮禁用，其余行照常', () => {
    render(
      <RealmBreakthroughList
        entries={[entry(1), entry(6)]}
        busyCode={null}
        onBreakthrough={vi.fn()}
      />,
    );

    expect(screen.getByTestId('realm-breakthrough-zone_r1')).toBeEnabled();
    expect(screen.getByTestId('realm-breakthrough-zone_r6')).toBeDisabled();
  });
});