/**
 * quest 逻辑服公开类型与常量（跨服只允许引用本文件或门面 `QuestLogicService`）
 *
 * 约定（§4.4）：其它逻辑服不得直接 import quest 的 `internal/`。
 */
export type {
  ChapterRow,
  ChapterProgressRow,
  QuestDefRow,
  QuestProgressRow,
  QuestRewards,
  QuestContext,
  QuestTrigger,
  QuestObjective,
  ObjectiveProgress,
  ZoneProgressLite,
} from './internal/quest.types.js';
export { QUEST_STATUSES, fail } from './internal/quest.types.js';
export type { FailResult } from './internal/quest.types.js';
