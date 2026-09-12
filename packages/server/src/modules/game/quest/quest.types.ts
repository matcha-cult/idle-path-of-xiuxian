/**
 * 任务域共享类型（P6）
 */
import { type FailResult, fail } from '../unit/unit.types.js';

export { fail };
export type { FailResult };

export interface QuestDefRow {
  id: number;
  code: string;
  chapter: number;
  name: string;
  trigger_type: string;
  trigger_cond: string | null;
  objectives: string;
  rewards: string;
  dialogues: string | null;
  next_quest: string | null;
  order_index: number;
}

export interface QuestProgressRow {
  id: number;
  character_id: number;
  quest_code: string;
  status: string;
  objectives: string | null;
  completed_at: Date | string | null;
  rewards_granted: boolean;
}

export interface QuestTrigger {
  realm?: number;
  requires?: string[];
}

export interface QuestObjective {
  type: string;
  key?: string;
  value?: number;
  desc?: string;
}

export interface QuestRewards {
  lingyun?: number;
  spiritStones?: number;
  jadeSlips?: number;
  currencies?: Record<string, number>;
  essences?: Record<string, number>;
}

export interface ObjectiveProgress {
  type: string;
  key?: string;
  value?: number;
  current: number;
  done: boolean;
  desc: string;
}

export interface ZoneProgressLite {
  bestFloor: number;
  cleared: boolean;
}

export interface QuestContext {
  realm: number;
  lingyun: number;
  ownItems: number;
  learnedSkills: number;
  zones: Map<string, ZoneProgressLite>;
  completed: Set<string>;
  /** P6.2 事件计数（kill_total/kill:<unit>/kill_realm:<r>/breakthrough_total/craft_total） */
  counters: Map<string, number>;
}

export const QUEST_STATUSES = ['locked', 'active', 'completed'] as const;

// ===== P7 章节 =====

export interface ChapterRow {
  id: number;
  code: string;
  chapter: number;
  name: string;
  theme: string | null;
  min_realm: number;
  zone_code: string;
  quest_start_code: string;
  quest_end_code: string;
  requires_chapter: string | null;
  rewards: string;
  dialogues: string | null;
  order_index: number;
}

export interface ChapterProgressRow {
  id: number;
  character_id: number;
  chapter_id: number;
  status: string;
  rewards_granted: boolean;
  completed_at: Date | string | null;
}
