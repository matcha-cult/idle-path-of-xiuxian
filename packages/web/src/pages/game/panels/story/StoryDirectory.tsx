/**
 * StoryDirectory —— 剧情的左侧目录（章节目录 + 任务剧本）。
 *
 * 章节与任务列表来自 quest 域（叙事与任务同源），剧情域只按 code 拉取剧本，
 * 因此这里不需要 store，纯展示 + 受控回调。协议字段不上屏：按钮只显示名称，
 * `code` 仅用于 key / testid / 回调参数。
 */
import { Button, Flex, Typography } from 'antd';
import type { ChapterView, QuestView } from '@idle-path/ionet-transport';
import { chapterLabel } from './presentation.js';

/** 当前选中的剧本来源。 */
export interface StorySelection {
  kind: 'chapter' | 'quest';
  /** 章节 code 或任务 code（只做标识，不上屏）。 */
  id: string;
}

export interface StoryDirectoryProps {
  chapters: readonly ChapterView[];
  quests: readonly QuestView[];
  selected: StorySelection | null;
  onSelect: (selection: StorySelection) => void;
}

/** 目录项按钮：选中态用 `primary`，其余用 `text`。 */
function isSelected(selected: StorySelection | null, kind: StorySelection['kind'], id: string): boolean {
  return selected !== null && selected.kind === kind && selected.id === id;
}

export function StoryDirectory(props: StoryDirectoryProps) {
  const { chapters, quests, selected, onSelect } = props;

  return (
    <Flex vertical gap={12}>
      <Flex vertical gap={4} data-testid="story-chapter-directory">
        <Typography.Text strong>章节目录</Typography.Text>
        {chapters.length === 0 ? (
          <Typography.Text type="secondary">暂无可选章节</Typography.Text>
        ) : (
          chapters.map((chapter) => (
            <Button
              key={chapter.code}
              block
              type={isSelected(selected, 'chapter', chapter.code) ? 'primary' : 'text'}
              onClick={() => onSelect({ kind: 'chapter', id: chapter.code })}
              data-testid={`story-chapter-${chapter.code}`}
            >
              {chapter.unlocked ? chapterLabel(chapter) : `${chapterLabel(chapter)}（未解锁）`}
            </Button>
          ))
        )}
      </Flex>

      <Flex vertical gap={4} data-testid="story-quest-directory">
        <Typography.Text strong>任务剧本</Typography.Text>
        {quests.length === 0 ? (
          <Typography.Text type="secondary">暂无任务剧本</Typography.Text>
        ) : (
          quests.map((quest) => (
            <Button
              key={quest.code}
              block
              type={isSelected(selected, 'quest', quest.code) ? 'primary' : 'text'}
              onClick={() => onSelect({ kind: 'quest', id: quest.code })}
              data-testid={`story-quest-${quest.code}`}
            >
              {quest.name}
            </Button>
          ))
        )}
      </Flex>
    </Flex>
  );
}
