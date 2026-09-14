/**
 * RealmPanel（新版·玩法驱动）测试：**14 境进度 + 破境后解锁**。
 *
 * 三态与破境动作拆到同目录 `RealmPanel.actions.test.tsx`（单文件规模）。
 * §22：`可进秘境` 改为 join 服务端的**突破名录**（全部免费历练秘境 + 「特殊秘境需道具」），
 * 不再按境界过滤（秘境已无境界闸门），因此 fixture 用 `ZoneBreakthroughView`。
 * 常量一律从 transport 导入（不写字面量）。
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { REALMS, type RealmStatusData, type ZoneBreakthroughView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { RealmPanel } from './RealmPanel.js';

function makeStatus(overrides: Partial<RealmStatusData> = {}): RealmStatusData {
  return { realm: 3, realmName: REALMS[2] ?? '柳筋', lingyun: 50, nextCost: 100, isMax: false, ...overrides };
}

function makeBreakthrough(overrides: Partial<ZoneBreakthroughView> = {}): ZoneBreakthroughView {
  return {
    code: 'zone_1',
    name: '青云山脚',
    realm: 1,
    tierKind: 'training',
    canBreakthrough: true,
    lockReason: 'ok',
    unlockItemCode: null,
    cleared: true,
    clears: 2,
    bestFloor: 4,
    maxFloor: 10,
    basePower: 20,
    powerStep: 4,
    ...overrides,
  };
}

function setup(seedFn?: (root: ReturnType<typeof createPanelHarness>['root']) => void) {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.zone.breakthrough = [makeBreakthrough()];
    seedFn?.(harness.root);
  });
  return harness;
}

describe('RealmPanel · 14 境进度与灵韵差额（玩法信息）', () => {
  it('展示 当前境界/第几境共几境/剩余灵韵/下一境消耗/可穿 T 阶', () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus();
    });
    harness.render(<RealmPanel />);

    const stats = screen.getByTestId('realm-progress-stats');
    expect(stats).toHaveTextContent('当前境界');
    expect(stats).toHaveTextContent(REALMS[2] ?? '');
    expect(stats).toHaveTextContent(new RegExp(`第 3 / ${REALMS.length} 境`));
    expect(stats).toHaveTextContent('剩余灵韵');
    expect(stats).toHaveTextContent('50');
    expect(stats).toHaveTextContent('下一境消耗');
    expect(stats).toHaveTextContent('100');
    expect(stats).toHaveTextContent('T4');
    expect(screen.getByTestId('realm-lingyun-bar')).toHaveTextContent('50 / 100');
  });

  it('回归：境界进度的说明文字必须落在 title（小字），不能进 value 行', () => {
    // 曾经的写法把「（第 3 境 / 共 14 境）」塞进 StatItem 的 suffix，而 antd v6 的 suffix
    // 与 value 共用 contentFontSize → PC 折 2 行、手机折 7 行（一字一行）。
    // 这里按 antd 的 DOM 结构把「主数值行」和「标题行」分开断言，防止再次退化。
    const harness = setup((root) => {
      root.realm.status = makeStatus();
    });
    harness.render(<RealmPanel />);

    const cell = screen.getByTestId('realm-progress-stats').querySelector('.ant-statistic');
    expect(cell?.querySelector('.ant-statistic-title')?.textContent).toBe(
      `当前境界 · 第 3 / ${REALMS.length} 境`,
    );
    // value 行只有境界名：既没有括号，也没有「共 N 境」这类说明
    const valueLine = cell?.querySelector('.ant-statistic-content')?.textContent ?? '';
    expect(valueLine).toBe(REALMS[2]);
    expect(valueLine).not.toContain('境 /');
    expect(valueLine).not.toContain('第');
  });

  it('灵韵不足时给出「差多少」而不是只报错', () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus({ lingyun: 50, nextCost: 120 });
    });
    harness.render(<RealmPanel />);

    const compare = screen.getByTestId('realm-cost-compare');
    expect(compare).toHaveTextContent('灵韵不足');
    expect(compare).toHaveTextContent('差 70');
  });

  it('灵韵达标时显示可以破境', () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus({ lingyun: 150, nextCost: 120 });
    });
    harness.render(<RealmPanel />);

    expect(screen.getByTestId('realm-cost-compare')).toHaveTextContent('可以破境');
  });

  it('「破境后解锁」列全部免费历练秘境，并提示特殊秘境需道具（不按境界过滤）', () => {
    const harness = setup((root) => {
      root.realm.status = makeStatus({ realm: 3 });
      root.zone.breakthrough = [
        makeBreakthrough({ name: '青云山脚', realm: 1 }),
        makeBreakthrough({ code: 'zone_5', name: '落霞谷', realm: 5 }),
        makeBreakthrough({
          code: 'zone_9',
          name: '寒潭',
          realm: 9,
          tierKind: 'special',
          canBreakthrough: false,
          lockReason: 'item_required',
          unlockItemCode: 'item_break_han',
        }),
      ];
    });
    harness.render(<RealmPanel />);

    const unlock = screen.getByTestId('realm-unlock');
    expect(unlock).toHaveTextContent('下一境');
    expect(unlock).toHaveTextContent(REALMS[3] ?? '');
    expect(unlock).toHaveTextContent('T4');
    expect(unlock).toHaveTextContent('青云山脚');
    expect(unlock).toHaveTextContent('落霞谷');
    expect(unlock).toHaveTextContent('特殊秘境需道具');
    // 特殊秘境不进「可进秘境」名单（只能以提示语表达）
    expect(unlock).not.toHaveTextContent('寒潭');
  });
});
