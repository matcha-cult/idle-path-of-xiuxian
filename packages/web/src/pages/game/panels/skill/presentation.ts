/**
 * 功法面板的**展示映射**（纯函数，单独成文件便于单测）。
 *
 * 这里只做两件事：把协议值翻译成玩家语言、把面板视图整理成槽位/表单数据。
 * **不含任何业务规则**（能否上槽、神识是否超预算仍由服务端判定），也不产出 ReactNode。
 */
import { PANEL_LIMITS } from '@idle-path/ionet-transport';
import type { PanelView, SkillBrief, SkillCatalogView, SkillPanelUpdateInput } from '@idle-path/ionet-transport';
import type { ActionField, SelectOption } from '@idle-path/ui-kit';

/** 槽位摘要（面板据此渲染 `SlotBoard`；空槽 `name` 为 null）。 */
export interface SkillSlotSummary {
  key: string;
  label: string;
  /** 槽内功法名；空槽为 null。 */
  name: string | null;
  /** 副文案（神识占用等）；空槽为 null。 */
  meta: string | null;
  /** 是否与主心法同流派（仅术法槽有意义，只做提示、不显示加成数值）。 */
  matched: boolean;
}

/** `skillType` 原文 → 中文（协议值不上屏）。 */
export function skillTypeLabel(skillType: string): string {
  if (skillType === 'xinfa') return '心法';
  if (skillType === 'shufa') return '术法';
  return '未知';
}

/** 图鉴卡副标题：类型 · 道基 · 神识占用（`school` 等协议字段不上屏）。 */
export function catalogMeta(skill: SkillCatalogView): string {
  return `${skillTypeLabel(skill.skillType)} · ${skill.daoji}道基 · 神识占用 ${skill.spiritCost}`;
}

/** 功法自身的神识占用文案；信息缺失（`info=null`）时退回占位。 */
function briefMeta(info: SkillBrief | null): string {
  return info === null ? '信息缺失' : `神识占用 ${info.spiritCost}`;
}

/** 主心法槽 + `PANEL_LIMITS.aux` 个辅心法槽（服务端上限，不从别处推导）。 */
export function xinfaSlotSummaries(panel: PanelView | null): SkillSlotSummary[] {
  const main = panel?.xinfa.mainInfo ?? null;
  const slots: SkillSlotSummary[] = [
    { key: 'main', label: '主心法', name: main?.name ?? null, meta: main === null ? null : briefMeta(main), matched: false },
  ];
  for (let index = 0; index < PANEL_LIMITS.aux; index += 1) {
    const info = panel?.xinfa.aux[index]?.info ?? null;
    slots.push({
      key: `aux-${index + 1}`,
      label: `辅心法 ${index + 1}`,
      name: info?.name ?? null,
      meta: info === null ? null : briefMeta(info),
      matched: false,
    });
  }
  return slots;
}

/** `PANEL_LIMITS.shufa` 个术法槽；`matched` 取服务端协同标记。 */
export function shufaSlotSummaries(panel: PanelView | null): SkillSlotSummary[] {
  const slots: SkillSlotSummary[] = [];
  for (let index = 0; index < PANEL_LIMITS.shufa; index += 1) {
    const entry = panel?.shufa[index] ?? null;
    slots.push({
      key: `shufa-${index + 1}`,
      label: `术法 ${index + 1}`,
      name: entry?.info?.name ?? null,
      meta: entry?.info == null ? null : briefMeta(entry.info),
      matched: entry?.synergy?.matched === true,
    });
  }
  return slots;
}

/** 同流派术法数 / 术法总数（道基协同汇总，只统计不计算加成）。 */
export function synergySummary(panel: PanelView | null): { matched: number; total: number } {
  const list = panel?.shufa ?? [];
  return { matched: list.filter((entry) => entry.synergy?.matched === true).length, total: list.length };
}

/** 神识预算文案；非有限数按 0 处理（纯展示防御）。 */
export function spiritText(used: number, budget: number): string {
  const safeUsed = Number.isFinite(used) ? used : 0;
  const safeBudget = Number.isFinite(budget) ? budget : 0;
  return `${safeUsed} / ${safeBudget}`;
}

/** 装配编辑器候选：只列**已修习**且类型匹配的功法（未修习上槽必被服务端拒）。 */
export function composerOptions(catalog: readonly SkillCatalogView[], skillType: string): SelectOption[] {
  return catalog
    .filter((skill) => skill.learned && skill.skillType === skillType)
    .map((skill) => ({ label: `${skill.name}（神识 ${skill.spiritCost}）`, value: skill.code }));
}

/** 装配编辑器字段声明（整组替换：主心法单选 + 辅心法/术法多选）。 */
export function composerFields(catalog: readonly SkillCatalogView[]): ActionField[] {
  return [
    {
      kind: 'select',
      name: 'main',
      label: '主心法',
      allowClear: true,
      placeholder: '不设主心法',
      options: composerOptions(catalog, 'xinfa'),
    },
    {
      kind: 'select',
      name: 'aux',
      label: `辅心法（最多 ${PANEL_LIMITS.aux} 门）`,
      mode: 'multiple',
      placeholder: '不设辅心法',
      options: composerOptions(catalog, 'xinfa'),
    },
    {
      kind: 'select',
      name: 'shufa',
      label: `术法（最多 ${PANEL_LIMITS.shufa} 门）`,
      mode: 'multiple',
      placeholder: '不设术法',
      options: composerOptions(catalog, 'shufa'),
    },
  ];
}

/** 装配编辑器初值：以当前面板为起点（整组替换）。 */
export function composerInitialValues(panel: PanelView | null): Record<string, unknown> {
  return {
    main: panel?.xinfa.main ?? undefined,
    aux: (panel?.xinfa.aux ?? []).map((entry) => entry.code),
    shufa: (panel?.shufa ?? []).map((entry) => entry.code),
  };
}

/** 表单值 → 协议入参；非字符串 / 空白 / 非数组一律剔除，避免把悬空值发给服务端。 */
export function composerInput(values: Record<string, unknown>): SkillPanelUpdateInput {
  const mainRaw = values.main;
  const main = typeof mainRaw === 'string' && mainRaw.trim() !== '' ? mainRaw.trim() : null;
  return { xinfa: { main, aux: stringArray(values.aux) }, shufa: stringArray(values.shufa) };
}

/** 单层数组净化：非数组 → `[]`；元素仅保留非空字符串。 */
export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim());
}
