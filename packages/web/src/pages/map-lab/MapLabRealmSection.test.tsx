/**
 * `MapLabRealmSection` 单测 —— 它只是把 `RootStore.zone` 接到既有的 `RealmStoneSection` 上，
 * 因此断言两件事：真的挂出了那块交互区；以及它读的是 store 的真值（不是自己造的数据）。
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runInAction } from 'mobx';
import { createPanelHarness } from '../../../test/helpers/panel-harness.js';
import { MapLabRealmSection } from './MapLabRealmSection.js';

describe('MapLabRealmSection', () => {
  it('挂出既有秘境石台交互区（§22 已交付，原样复用）', () => {
    const harness = createPanelHarness();
    harness.render(<MapLabRealmSection />);
    expect(screen.getByTestId('realm-stone-section')).toBeInTheDocument();
  });

  it('标题里带上 store 的突破名录计数（真值来自 zone store，不是前端推导）', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      runInAction(() => {
        harness.root.zone.breakthrough = [
          { zoneCode: 'zone_a', zoneName: '甲', tierKind: 'training', cleared: true, canBreakthrough: false },
          { zoneCode: 'zone_b', zoneName: '乙', tierKind: 'training', cleared: false, canBreakthrough: true },
        ] as never;
      });
    });
    harness.render(<MapLabRealmSection />);
    expect(screen.getByTestId('realm-stone-section')).toHaveTextContent('已突破 1 / 2 处');
  });
});
