/**
 * 剧情面板的展示映射（纯函数，单独成文件便于单测）。
 *
 * 只做「协议节点 → `StoryTimeline` 节点」的转换与文案 join：**不显示 `nodeKey`**，
 * 节点类型（`chapter_intro` / `quest_done` …）由 `StoryTimeline` 映射成中文标签；
 * `questCode` 在这里 join 成任务名，绝不把 code 打到屏幕上。
 */
import type { ChapterView, QuestView, StoryNode } from '@idle-path/ionet-transport';
import type { StoryNodeView } from '@idle-path/ui-kit';

/** 章节目录标题：`第 N 章 · 名称`（不显示 `code`）。 */
export function chapterLabel(chapter: Pick<ChapterView, 'chapter' | 'name'>): string {
  return `第 ${chapter.chapter} 章 · ${chapter.name}`;
}

/** 未读节点数（`seen` 未传按未读处理，与 `StoryTimeline` 口径一致）。 */
export function unreadCount(nodes: readonly StoryNode[]): number {
  return nodes.filter((node) => node.seen !== true).length;
}

/** 任务剧本标题：把 `questCode` join 成任务名；查不到时给通用标题（不显示 code）。 */
export function questScriptTitle(nodes: readonly StoryNode[], quests: readonly QuestView[]): string {
  const code = nodes.find((node) => node.questCode !== undefined)?.questCode;
  if (code === undefined) return '任务剧本';
  const name = quests.find((quest) => quest.code === code)?.name;
  return name === undefined ? '任务剧本' : `任务剧本 · ${name}`;
}

/**
 * 协议节点 → `StoryTimeline` 视图节点。
 * 已读节点不再提供 `onSeen`（避免出现「对已读内容再标已读」的入口）。
 */
export function toNodeViews(
  nodes: readonly StoryNode[],
  onSeen: (nodeKey: string) => void,
): StoryNodeView[] {
  return nodes.map((node) => ({
    nodeKey: node.nodeKey,
    type: node.type,
    text: node.text,
    seen: node.seen,
    ...(node.seen === true ? {} : { onSeen: () => onSeen(node.nodeKey) }),
  }));
}
