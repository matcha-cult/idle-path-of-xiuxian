/**
 * 任务面板的展示映射（纯函数，单独成文件便于单测）。
 *
 * 这里只做「服务端字段 → 玩家语言」的翻译：**不含任何业务规则**——
 * 任务是否可结算（`claimable`）、章节是否解锁（`unlocked`）都由服务端实时判定，
 * 本文件只在两侧做排序、计数与文案。
 *
 * 协议字段不上屏：`code` 只做 key/join，`orderIndex` 只排序，`status` 与
 * `objectives[].type/key` 一律映射为中文。
 */
import type { ChapterView, ObjectiveProgress, QuestStatus, QuestView } from '@idle-path/ionet-transport';
import { formatCompactNumber } from '../../../../domain/format.js';

/**
 * 任务状态 → 中文（绝不把 `active` 这类协议原文打到屏幕上）。
 *
 * 查表类型放宽为 `Record<string, string | undefined>`：配合 `noUncheckedIndexedAccess`，
 * 未知状态码在类型上就是 `string | undefined`，由 `??` 兜底成中文占位——
 * 不在类型上撒谎，也不会把协议原文漏到屏幕上。
 */
const STATUS_LABELS: Record<string, string | undefined> = {
  locked: '未解锁',
  active: '进行中',
  completed: '已完成',
};

/** 未知状态码的中文占位（兜底，绝不上屏协议 code）。 */
const UNKNOWN_STATUS_LABEL = '未知状态';

/** 未知状态码的标签色兜底。 */
const UNKNOWN_STATUS_COLOR = 'default';

/** 状态标签色（只用 antd `Tag` 预设色名）。 */
const STATUS_COLORS: Record<string, 'success' | 'processing' | 'default' | undefined> = {
  locked: 'default',
  active: 'processing',
  completed: 'success',
};

export function questStatusLabel(status: QuestStatus): string {
  return STATUS_LABELS[status] ?? UNKNOWN_STATUS_LABEL;
}

export function questStatusColor(status: QuestStatus): 'success' | 'processing' | 'default' {
  return STATUS_COLORS[status] ?? UNKNOWN_STATUS_COLOR;
}

/** 目标进度文案：`当前 / 目标`；`value` 缺省或非有限数时只显示当前。 */
export function objectiveProgressText(objective: ObjectiveProgress): string {
  const current = formatCompactNumber(objective.current);
  const target = objective.value;
  if (target === undefined || !Number.isFinite(target)) return current;
  return `${current} / ${formatCompactNumber(target)}`;
}

/** 目标进度百分比（0~100）：目标缺失或非正数时按「已完成 100 / 否则 0」处理。 */
export function objectivePercent(objective: ObjectiveProgress): number {
  const target = objective.value;
  if (target === undefined || !Number.isFinite(target) || target <= 0) {
    return objective.done === true ? 100 : 0;
  }
  const percent = Math.floor((objective.current / target) * 100);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

/** 按章节 + 顺序号排序（`orderIndex` 只用于排序，不上屏）。 */
export function sortQuests(quests: readonly QuestView[]): QuestView[] {
  return [...quests].sort((a, b) => a.chapter - b.chapter || a.orderIndex - b.orderIndex);
}

/** 可结算任务数（`claimable` 由服务端实时评估）。 */
export function claimableCount(quests: readonly QuestView[]): number {
  return quests.filter((quest) => quest.claimable).length;
}

/** 章节完成进度文案：`已完成 / 章节总数`。 */
export function chapterProgressText(chapters: readonly ChapterView[]): string {
  const done = chapters.filter((chapter) => chapter.completed).length;
  return `${formatCompactNumber(done)} / ${formatCompactNumber(chapters.length)}`;
}

/** 章节锁定提示：`realm` 走「需要/当前」对比，`prev` 走前置章节名。 */
export interface ChapterLock {
  reason: 'realm' | 'prev';
  hint?: string;
}

/** 已解锁返回 `null`；未解锁时给出原因类别与业务文案（不含协议 code）。 */
export function chapterLock(chapter: ChapterView, chapters: readonly ChapterView[]): ChapterLock | null {
  if (chapter.unlocked) return null;
  if (chapter.unlockedReason === 'realm') return { reason: 'realm' };
  const prev = chapters.find((entry) => entry.code === chapter.requiresChapter);
  return { reason: 'prev', hint: prev === undefined ? '需先完成前置章节' : `需先完成「${prev.name}」` };
}
