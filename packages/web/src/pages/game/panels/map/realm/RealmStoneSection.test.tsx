/**
 * RealmStoneSection：计数文案 / 名录与实况两块都在 / 未在战斗时给出无战斗提示。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ZoneBreakthroughView } from '@idle-path/ionet-transport';
import { RealmStoneSection } from './RealmStoneSection.js';

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

describe('RealmStoneSection', () => {
  it('标题为「秘境石台」，并统计已突破数与免费历练秘境数', () => {
    render(
      <RealmStoneSection
        entries={[entry(1, { cleared: true, clears: 1 }), entry(2), entry(6)]}
        busyCode={null}
        online={null}
        onBreakthrough={vi.fn()}
        onRefreshOnline={vi.fn()}
      />,
    );

    expect(screen.getByText('秘境石台')).toBeInTheDocument();
    expect(screen.getByText('已突破 1 / 3 处 · 免费历练秘境 2 处随时可突破')).toBeInTheDocument();
  });

  it('同时渲染突破名录与在线战斗实况（两处共用同一份服务端帧）', () => {
    render(
      <RealmStoneSection
        entries={[entry(1)]}
        busyCode={null}
        online={null}
        onBreakthrough={vi.fn()}
        onRefreshOnline={vi.fn()}
      />,
    );

    expect(screen.getByTestId('realm-breakthrough-list')).toBeInTheDocument();
    // 实况帧为 null 时 ZoneOnlineSection 仍挂载，并显示「尚未读取」状态
    expect(screen.getByText('尚未读取历练实况')).toBeInTheDocument();
  });

  it('名录为空（老服务端 / 未鉴权）→ 占位文案仍显示，不崩', () => {
    render(
      <RealmStoneSection
        entries={[]}
        busyCode={null}
        online={null}
        onBreakthrough={vi.fn()}
        onRefreshOnline={vi.fn()}
      />,
    );

    expect(screen.getByTestId('realm-breakthrough-empty')).toBeInTheDocument();
    expect(screen.getByText('已突破 0 / 0 处 · 免费历练秘境 0 处随时可突破')).toBeInTheDocument();
  });
});