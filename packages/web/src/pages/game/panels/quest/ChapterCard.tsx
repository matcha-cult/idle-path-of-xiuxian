/**
 * ChapterCard —— 单个章节卡（从 QuestPanel 拆出）。
 *
 * 已解锁的章节显示任务进度条；未解锁的章节用 `LockedHint` 说清「差什么才能进」，
 * 让玩家知道后面还有什么可做。协议字段不上屏：`code` 只做 key，`requiresChapter`
 * 由 `presentation.chapterLock` 解析成前置章节名。
 */
import { Card, Flex, Progress, Tag, Typography } from 'antd';
import type { ChapterView } from '@idle-path/ionet-transport';
import { LockedHint } from '@idle-path/ui-kit';
import { chapterLock } from './presentation.js';

export interface ChapterCardProps {
  chapter: ChapterView;
  /** 全部章节（用于把前置章节 code 解析成名称）。 */
  chapters: readonly ChapterView[];
  /** 是否当前章节。 */
  current: boolean;
  /** 当前角色境界（「境界不足」对比用；未知传 undefined）。 */
  realm: number | undefined;
}

/** 章节任务进度百分比（0~100，章节无任务时为 0）。 */
function chapterPercent(total: number, completed: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.floor((completed / total) * 100)));
}

export function ChapterCard({ chapter, chapters, current, realm }: ChapterCardProps) {
  const lock = chapterLock(chapter, chapters);
  const { total, completed } = chapter.quests;

  return (
    <Card
      data-testid={`chapter-card-${chapter.code}`}
      variant="outlined"
      title={
        <Flex align="center" wrap gap={8}>
          <span>{chapter.name}</span>
          <Tag>第 {chapter.chapter} 章</Tag>
          {current ? <Tag color="processing">当前</Tag> : null}
          {chapter.completed ? <Tag color="success">已完成</Tag> : null}
        </Flex>
      }
    >
      <Flex vertical gap={8}>
        <Typography.Text type="secondary">
          任务进度 {completed} / {total}
        </Typography.Text>
        <Progress
          percent={chapterPercent(total, completed)}
          showInfo={false}
          status={chapter.completed ? 'success' : 'active'}
        />
        {lock === null ? null : (
          <div data-testid={`chapter-locked-${chapter.code}`}>
            {lock.reason === 'realm' ? (
              <LockedHint
                title={`${chapter.name} 尚未解锁`}
                reason="realm"
                required={chapter.minRealm}
                current={realm}
              />
            ) : (
              <LockedHint
                title={`${chapter.name} 尚未解锁`}
                reason="prev"
                hint={lock.hint ?? '需先完成前置章节'}
              />
            )}
          </div>
        )}
      </Flex>
    </Card>
  );
}
