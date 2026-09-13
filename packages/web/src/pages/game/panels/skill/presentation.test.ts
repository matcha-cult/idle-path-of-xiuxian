/** 功法展示映射纯函数测试：槽位整理 / 选项过滤 / 表单净化 / 边界（null、空数组、非字符串）。 */
import { describe, expect, it } from 'vitest';
import { PANEL_LIMITS } from '@idle-path/ionet-transport';
import type { PanelView, SkillBrief, SkillCatalogView } from '@idle-path/ionet-transport';
import {
  catalogMeta,
  composerFields,
  composerInitialValues,
  composerInput,
  composerOptions,
  shufaSlotSummaries,
  skillTypeLabel,
  spiritText,
  stringArray,
  synergySummary,
  xinfaSlotSummaries,
} from './presentation.js';

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
      { code: 'shufa_a', info: brief('shufa_a', '裂空剑诀', 0), synergy: { code: 'shufa_a', matched: true, text: '道基协同 +20%（占位）' } },
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
    learned: true,
    level: 3,
    effectsTexts: [],
    ...overrides,
  };
}

describe('skill/presentation · 槽位与文案', () => {
  it('skillTypeLabel 只映射已知类型，未知值不泄露原文', () => {
    expect(skillTypeLabel('xinfa')).toBe('心法');
    expect(skillTypeLabel('shufa')).toBe('术法');
    expect(skillTypeLabel('weird')).toBe('未知');
  });

  it('catalogMeta 用中文类型与神识占用，不含 school 原文', () => {
    const meta = catalogMeta(makeSkill({ school: '太虚秘典' }));
    expect(meta).toContain('心法');
    expect(meta).toContain('神识占用 5');
    expect(meta).not.toContain('太虚秘典');
  });

  it('心法槽固定 1 主 + N 辅，空槽 name/meta 为 null', () => {
    const slots = xinfaSlotSummaries(makePanel());
    expect(slots).toHaveLength(PANEL_LIMITS.aux + 1);
    expect(slots[0]).toMatchObject({ key: 'main', label: '主心法', name: '太虚心法' });
    expect(slots[1]).toMatchObject({ key: 'aux-1', name: '玄水诀', meta: '神识占用 20' });
    expect(slots[2]).toMatchObject({ key: 'aux-2', name: null, meta: null });
    expect(slots[3]).toMatchObject({ key: 'aux-3', name: null });
  });

  it('术法槽固定 N 个并透传协同标记', () => {
    const slots = shufaSlotSummaries(makePanel());
    expect(slots).toHaveLength(PANEL_LIMITS.shufa);
    expect(slots[0]).toMatchObject({ name: '裂空剑诀', matched: true });
    expect(slots[1]).toMatchObject({ name: '烈焰术', matched: false });
    expect(slots[2]).toMatchObject({ name: null, meta: null, matched: false });
  });

  it('边界：panel=null 时槽位仍按上限铺满且不崩', () => {
    expect(xinfaSlotSummaries(null)).toHaveLength(PANEL_LIMITS.aux + 1);
    expect(shufaSlotSummaries(null)).toHaveLength(PANEL_LIMITS.shufa);
    expect(xinfaSlotSummaries(null).every((slot) => slot.name === null)).toBe(true);
    expect(synergySummary(null)).toEqual({ matched: 0, total: 0 });
  });

  it('synergySummary 只统计 matched=true 的术法', () => {
    expect(synergySummary(makePanel())).toEqual({ matched: 1, total: 2 });
    expect(
      synergySummary(makePanel({ shufa: [{ code: 'x', info: null, synergy: null }] })),
    ).toEqual({ matched: 0, total: 1 });
  });

  it('spiritText 对 NaN / Infinity 退化为 0，不出现 NaN 文案', () => {
    expect(spiritText(20, 100)).toBe('20 / 100');
    expect(spiritText(Number.NaN, Number.POSITIVE_INFINITY)).toBe('0 / 0');
  });
});

describe('skill/presentation · 装配编辑器', () => {
  const catalog: SkillCatalogView[] = [
    makeSkill({ id: 1, code: 'xinfa_a', name: '太虚心法', skillType: 'xinfa', learned: true }),
    makeSkill({ id: 2, code: 'xinfa_b', name: '玄水诀', skillType: 'xinfa', learned: false }),
    makeSkill({ id: 3, code: 'shufa_a', name: '裂空剑诀', skillType: 'shufa', learned: true }),
  ];

  it('composerOptions 只列已修习且类型匹配的功法', () => {
    expect(composerOptions(catalog, 'xinfa')).toEqual([{ label: '太虚心法（神识 5）', value: 'xinfa_a' }]);
    expect(composerOptions(catalog, 'shufa')).toEqual([{ label: '裂空剑诀（神识 5）', value: 'shufa_a' }]);
    expect(composerOptions([], 'shufa')).toEqual([]);
  });

  it('composerFields 声明三段字段，多选上限写进标签', () => {
    const fields = composerFields(catalog);
    expect(fields.map((field) => field.name)).toEqual(['main', 'aux', 'shufa']);
    expect(fields[1]).toMatchObject({ mode: 'multiple' });
  });

  it('composerInitialValues 以当前面板 code 为初值；panel=null 给空格局', () => {
    expect(composerInitialValues(makePanel())).toEqual({
      main: 'xinfa_a',
      aux: ['xinfa_b'],
      shufa: ['shufa_a', 'shufa_b'],
    });
    expect(composerInitialValues(null)).toEqual({ main: undefined, aux: [], shufa: [] });
  });

  it('composerInput 净化空白与非法元素，清空主心法回 null', () => {
    expect(composerInput({ main: ' xinfa_a ', aux: ['a', 'b'], shufa: ['c'] })).toEqual({
      xinfa: { main: 'xinfa_a', aux: ['a', 'b'] },
      shufa: ['c'],
    });
    expect(composerInput({ main: '   ', aux: ['', '  ', 3, null], shufa: 'not-array' })).toEqual({
      xinfa: { main: null, aux: [] },
      shufa: [],
    });
    expect(composerInput({})).toEqual({ xinfa: { main: null, aux: [] }, shufa: [] });
  });

  it('stringArray 对非数组与混合元素做防御', () => {
    expect(stringArray(undefined)).toEqual([]);
    expect(stringArray('a')).toEqual([]);
    expect(stringArray(['a', 1, '', 'b', null])).toEqual(['a', 'b']);
  });
});
