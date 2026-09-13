/** SkillPanel 测试：面板概要 / 图鉴表格 / 三态 / 交互（修习·参悟·注入）/ 边界（panel=null）。 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SKILL_CMD } from '@idle-path/ionet-transport';
import type { PanelView, SkillBrief, SkillCatalogView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { SkillPanel } from './SkillPanel.js';

function brief(code: string, name: string): SkillBrief {
  return { code, name, daoji: '剑', spiritCost: 5 };
}

function makePanel(overrides: Partial<PanelView> = {}): PanelView {
  return {
    xinfa: { main: 'xinfa_a', mainInfo: brief('xinfa_a', '太虚心法'), aux: [{ code: 'xinfa_b', info: brief('xinfa_b', '玄水诀') }] },
    shufa: [{ code: 'shufa_a', info: brief('shufa_a', '裂空剑诀'), synergy: null }],
    spiritUsed: 5,
    spiritBudget: 100,
    mainDaoji: '剑',
    ...overrides,
  };
}

function makeSkill(overrides: Partial<SkillCatalogView> = {}): SkillCatalogView {
  return { id: 7, code: 'xinfa_a', name: '太虚心法', skillType: 'xinfa', daoji: '剑', school: '太虚', spiritCost: 10, description: '', learned: false, level: null, effectsTexts: [], ...overrides };
}

describe('SkillPanel', () => {
  it('渲染面板概要（主心法 / 辅心法数 / 术法数）与图鉴行', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.skill.panel = makePanel();
      harness.root.skill.catalog = [
        makeSkill({ id: 7, learned: true, level: 5 }),
        makeSkill({ id: 8, code: 'shufa_a', name: '裂空剑诀', skillType: 'shufa', spiritCost: 12 }),
      ];
    });
    harness.render(<SkillPanel />);

    expect(screen.getByTestId('skill-panel-summary')).toHaveTextContent('太虚心法');
    expect(screen.getByText('xinfa_a')).toBeInTheDocument();
    expect(screen.getByText('已修习')).toBeInTheDocument();
    expect(screen.getByText('未修习')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('空态：catalog 为空时显示空态文案', () => {
    const harness = createPanelHarness();
    harness.render(<SkillPanel />);

    expect(screen.getByTestId('async-boundary-empty')).toBeInTheDocument();
    expect(screen.getByText('暂无功法数据')).toBeInTheDocument();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.skill.loading = true;
    });
    const view = harness.render(<SkillPanel />);
    expect(screen.getByTestId('async-boundary-loading')).toBeInTheDocument();
    view.unmount();

    harness.seed(() => {
      harness.root.skill.loading = false;
      harness.root.skill.error = '功法加载失败';
    });
    harness.render(<SkillPanel />);
    expect(screen.getByText('功法加载失败')).toBeInTheDocument();
    expect(screen.getByTestId('async-boundary-retry')).toBeInTheDocument();
  });

  it('未修习行点「修习」经 WS 发出 skill.learn（skillId 正确）', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.skill.catalog = [makeSkill({ id: 7, learned: false })];
    });
    harness.render(<SkillPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('skill-learn-7'));

    const requests = harness.requests.filter(
      (r) => r.cmd === SKILL_CMD.cmd && r.subCmd === SKILL_CMD.learn,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.data).toEqual({ skillId: 7 });
  }, 20000);

  it('点「参悟」→ 确认后经 WS 发出 skill.enlighten（skillId 正确）', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.skill.catalog = [makeSkill({ id: 8, learned: true, level: 5 })];
    });
    harness.render(<SkillPanel />);
    await harness.connect();

    expect(screen.queryByTestId('skill-learn-8')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('skill-enlighten-8'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    const requests = harness.requests.filter(
      (r) => r.cmd === SKILL_CMD.cmd && r.subCmd === SKILL_CMD.enlighten,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.data).toEqual({ skillId: 8 });
  }, 20000);

  it('开发注入：确认后经 WS 发出 skill.lingyunGrant（amount 正确）', async () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.skill.catalog = [makeSkill()];
    });
    harness.render(<SkillPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('skill-lingyun-grant'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    const requests = harness.requests.filter(
      (r) => r.cmd === SKILL_CMD.cmd && r.subCmd === SKILL_CMD.lingyunGrant,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.data).toEqual({ amount: 1 });
  }, 20000);

  it('边界：panel=null 时仍渲染图鉴表格，概要用占位符不崩', () => {
    const harness = createPanelHarness();
    harness.seed(() => {
      harness.root.skill.panel = null;
      harness.root.skill.catalog = [makeSkill({ id: 9, code: 'shufa_b', name: '烈焰术' })];
    });
    harness.render(<SkillPanel />);

    expect(screen.getByTestId('skill-panel-summary')).toHaveTextContent('空');
    expect(screen.getByText('shufa_b')).toBeInTheDocument();
    expect(screen.queryByTestId('async-boundary-empty')).not.toBeInTheDocument();
  });
});
