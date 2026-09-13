/**
 * SkillPanel（新版·玩法驱动）测试。
 * 重点：九槽/神识预算是否呈现、协同是否只做提示、装配是否发出正确 code、协议字段是否没上屏。
 * 常量一律从 transport 导入（不写字面量），交互用例必须先 `await harness.connect()`。
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PANEL_LIMITS, SKILL_CMD } from '@idle-path/ionet-transport';
import type { Character, PanelView, SkillBrief, SkillCatalogView } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../../../../test/helpers/panel-harness.js';
import { SkillPanel } from './SkillPanel.js';

function brief(code: string, name: string, spiritCost = 5): SkillBrief {
  return { code, name, daoji: '剑', spiritCost };
}

function makePanel(overrides: Partial<PanelView> = {}): PanelView {
  return {
    xinfa: {
      main: 'xinfa_a',
      mainInfo: brief('xinfa_a', '太虚心法'),
      aux: [{ code: 'xinfa_b', info: brief('xinfa_b', '玄水诀', 20) }],
    },
    shufa: [
      {
        code: 'shufa_a',
        info: brief('shufa_a', '裂空剑诀', 0),
        synergy: { code: 'shufa_a', matched: true, text: '道基协同 +20%（占位）' },
      },
      { code: 'shufa_b', info: brief('shufa_b', '烈焰术', 0), synergy: { code: 'shufa_b', matched: false, text: '' } },
    ],
    spiritUsed: 20,
    spiritBudget: 100,
    mainDaoji: '剑',
    ...overrides,
  };
}

function makeSkill(overrides: Partial<SkillCatalogView> = {}): SkillCatalogView {
  return {
    id: 7,
    code: 'xinfa_a',
    name: '太虚心法',
    skillType: 'xinfa',
    daoji: '剑',
    school: '太虚',
    spiritCost: 5,
    description: '',
    learned: false,
    level: null,
    effectsTexts: [],
    ...overrides,
  };
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 1,
    userId: 1,
    nickname: '散修',
    gender: 'male',
    title: null,
    spiritStones: 0,
    silver: 0,
    realm: 3,
    lingyun: 500,
    jadeSlips: 3,
    ...overrides,
  };
}

function setup(seedFn?: (root: ReturnType<typeof createPanelHarness>['root']) => void) {
  const harness = createPanelHarness();
  harness.seed(() => {
    harness.root.session.character = makeCharacter();
    seedFn?.(harness.root);
  });
  return harness;
}

describe('SkillPanel · 九槽与神识预算（玩法信息）', () => {
  it('展示主心法/道基/辅心法数/术法数/神识预算与九槽内容', () => {
    const harness = setup((root) => {
      root.skill.panel = makePanel();
      root.skill.catalog = [
        makeSkill({ id: 7, learned: true, level: 5 }),
        makeSkill({ id: 8, code: 'shufa_a', name: '裂空剑诀', skillType: 'shufa', spiritCost: 0, learned: true, level: 1 }),
      ];
    });
    harness.render(<SkillPanel />);

    const overview = screen.getByTestId('skill-overview');
    expect(overview).toHaveTextContent('太虚心法');
    expect(overview).toHaveTextContent('剑');
    expect(overview).toHaveTextContent(new RegExp(`1\\s*/\\s*${PANEL_LIMITS.aux}`));
    expect(overview).toHaveTextContent(new RegExp(`2\\s*/\\s*${PANEL_LIMITS.shufa}`));
    expect(screen.getByTestId('skill-spirit-bar')).toHaveTextContent(new RegExp(`20\\s*/\\s*100`));

    const xinfaBoard = screen.getByTestId('skill-xinfa-board');
    expect(xinfaBoard).toHaveTextContent('主心法');
    expect(xinfaBoard).toHaveTextContent('太虚心法');
    expect(xinfaBoard).toHaveTextContent('玄水诀');
    expect(xinfaBoard).toHaveTextContent('空槽');
    expect(screen.getByTestId('skill-shufa-board')).toHaveTextContent('裂空剑诀');
    expect(screen.getByTestId('skill-catalog')).toHaveTextContent('太虚心法');
  });

  it('道基协同只做「同流派 N 门」提示，不出现 +20% / 占位 数值', () => {
    const harness = setup((root) => {
      root.skill.panel = makePanel();
    });
    harness.render(<SkillPanel />);

    expect(screen.getByTestId('skill-synergy-summary')).toHaveTextContent(new RegExp(`1\\s*/\\s*2`));
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('+20%');
    expect(text).not.toContain('占位');
  });

  it('空态：panel 与 catalog 都为空时显示空态文案', () => {
    const harness = setup();
    harness.render(<SkillPanel />);

    // 主面板与功法册各有一个 AsyncBoundary，两者都应进入空态。
    expect(screen.getAllByTestId('async-boundary-empty')).toHaveLength(2);
    expect(screen.getAllByText('暂无功法数据')).toHaveLength(1);
    expect(screen.getByText('暂无功法')).toBeInTheDocument();
  });

  it('加载中显示骨架，错误显示可重试', () => {
    const harness = setup((root) => {
      root.skill.loading = true;
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
});

describe('SkillPanel · 修习 / 参悟 / 装配', () => {
  it('未修习点「修习」经 WS 发出 skill.learn（skillId 正确）', async () => {
    const harness = setup((root) => {
      root.skill.catalog = [makeSkill({ id: 7, learned: false })];
    });
    harness.render(<SkillPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('skill-learn-7'));

    await waitFor(() =>
      expect(
        harness.requests.filter((r) => r.cmd === SKILL_CMD.cmd && r.subCmd === SKILL_CMD.learn).length,
      ).toBe(1),
    );
    const request = harness.requests.find((r) => r.subCmd === SKILL_CMD.learn);
    expect(request?.data).toEqual({ skillId: 7 });
  });

  it('已修习点「参悟」→ 确认后经 WS 发出 skill.enlighten（skillId 正确）', async () => {
    const harness = setup((root) => {
      root.skill.catalog = [makeSkill({ id: 8, learned: true, level: 5 })];
    });
    harness.render(<SkillPanel />);
    await harness.connect();

    expect(screen.queryByTestId('skill-learn-8')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('skill-enlighten-8'));
    await userEvent.click(await screen.findByRole('button', { name: /确\s*定/ }));

    await waitFor(() =>
      expect(
        harness.requests.filter((r) => r.cmd === SKILL_CMD.cmd && r.subCmd === SKILL_CMD.enlighten).length,
      ).toBe(1),
    );
    const request = harness.requests.find((r) => r.subCmd === SKILL_CMD.enlighten);
    expect(request?.data).toEqual({ skillId: 8 });
  });

  it('玉简不足时「修习」禁用并给出原因', async () => {
    const harness = setup((root) => {
      root.session.character = makeCharacter({ jadeSlips: 0 });
      root.skill.catalog = [makeSkill({ id: 7, learned: false })];
    });
    harness.render(<SkillPanel />);

    const button = screen.getByTestId('skill-learn-7');
    expect(button).toBeDisabled();
    await userEvent.hover(button);
    expect(await screen.findByText(/玉简不足/)).toBeInTheDocument();
  });

  it('装配编辑器：改主心法后保存，经 WS 发出 skill.panelUpdate（整组 code）', async () => {
    const harness = setup((root) => {
      root.skill.panel = makePanel({ xinfa: { main: 'xinfa_a', mainInfo: brief('xinfa_a', '太虚心法'), aux: [] }, shufa: [] });
      root.skill.catalog = [
        makeSkill({ id: 1, code: 'xinfa_a', name: '太虚心法', learned: true, level: 1 }),
        makeSkill({ id: 2, code: 'xinfa_b', name: '玄水诀', learned: true, level: 1 }),
        makeSkill({ id: 3, code: 'shufa_a', name: '裂空剑诀', skillType: 'shufa', learned: true, level: 1 }),
      ];
    });
    harness.render(<SkillPanel />);
    await harness.connect();

    await userEvent.click(screen.getByTestId('skill-edit'));
    await userEvent.click(screen.getByTestId('select-field-main'));
    await userEvent.click(await screen.findByTitle('玄水诀（神识 5）'));
    await userEvent.click(screen.getByRole('button', { name: /保存面板/ }));

    await waitFor(() =>
      expect(
        harness.requests.filter((r) => r.cmd === SKILL_CMD.cmd && r.subCmd === SKILL_CMD.panelUpdate).length,
      ).toBe(1),
    );
    const request = harness.requests.find((r) => r.subCmd === SKILL_CMD.panelUpdate);
    expect(request?.data).toEqual({ xinfa: { main: 'xinfa_b', aux: [] }, shufa: [] });
  });
});

describe('SkillPanel · 边界与协议字段', () => {
  it('边界：panel=null 但图鉴非空时不进空态，槽位铺满、编辑器禁用', () => {
    const harness = setup((root) => {
      root.skill.panel = null;
      root.skill.catalog = [makeSkill({ id: 9, code: 'shufa_b', name: '烈焰术', skillType: 'shufa' })];
    });
    harness.render(<SkillPanel />);

    expect(screen.queryByTestId('async-boundary-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('skill-overview')).toHaveTextContent('未配置');
    expect(screen.getByTestId('skill-overview')).toHaveTextContent('未定');
    expect(screen.getAllByTestId('slot-board-slot')).toHaveLength(PANEL_LIMITS.aux + 1 + PANEL_LIMITS.shufa);
    expect(screen.getByTestId('skill-edit')).toBeDisabled();
  });

  it('主心法为空时给出「尚未配置主心法」的 LockedHint，配置后不再出现', () => {
    const harness = setup((root) => {
      root.skill.panel = makePanel({ xinfa: { main: null, mainInfo: null, aux: [] } });
    });
    const view = harness.render(<SkillPanel />);
    expect(screen.getByTestId('skill-main-locked')).toHaveTextContent('尚未配置主心法');
    view.unmount();

    harness.seed(() => {
      harness.root.skill.panel = makePanel();
    });
    harness.render(<SkillPanel />);
    expect(screen.queryByTestId('skill-main-locked')).toBeNull();
  });

  it('协议字段不上屏，且不出现 ISO 时间串', () => {
    const harness = setup((root) => {
      root.skill.panel = makePanel();
      root.skill.catalog = [makeSkill({ id: 7, learned: true, level: 5 })];
    });
    harness.render(<SkillPanel />);

    const text = document.body.textContent ?? '';
    for (const leaked of ['xinfa_a', 'shufa_a', 'skillType', 'growth_rate', 'school', 'spiritBudget', 'mainDaoji']) {
      expect(text).not.toContain(leaked);
    }
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
