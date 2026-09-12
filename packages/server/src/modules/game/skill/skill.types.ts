/**
 * 功法域共享类型与常量
 */

export type SkillType = 'xinfa' | 'shufa';

/** 道基标签集合（⑤A：剑/雷/火/冰/体/阵/丹/符） */
export const DAOJI_SET = ['剑', '雷', '火', '冰', '体', '阵', '丹', '符'] as const;
export type Daoji = (typeof DAOJI_SET)[number];

/** game_skills 表行 */
export interface SkillRow {
  id: number;
  code: string;
  name: string;
  skill_type: string;
  daoji: string;
  school: string;
  spirit_cost: number;
  effects: string; // JSON 字符串
  growth_rate: number;
  description: string | null;
}

/** 已修习行 */
export interface LearnedRow {
  id: number;
  character_id: number;
  skill_id: number;
  level: number;
}

/** 面板 slots JSON 结构 */
export interface PanelSlots {
  xinfa: { main: string | null; aux: string[] };
  shufa: string[];
}

export const PANEL_LIMITS = { aux: 3, shufa: 5 } as const;

export function emptyPanel(): PanelSlots {
  return { xinfa: { main: null, aux: [] }, shufa: [] };
}

/** 业务失败结果 */
export interface FailResult {
  success: false;
  message: string;
  data: { code: string };
}

export function fail(code: string, message: string): FailResult {
  return { success: false, message, data: { code } };
}
