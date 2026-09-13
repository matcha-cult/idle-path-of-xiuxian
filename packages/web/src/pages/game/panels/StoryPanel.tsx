/**
 * StoryPanel —— 剧情演出（道途线）。**新版**：按 `10-玩法驱动的面板设计.md` §1.9 重做。
 *
 * 玩家在这张面板上要回答三个问题（界面三段结构据此组织）：
 *   1. 剧情进展到哪？→ 左侧章节目录（来自 quest 域，叙事与任务同源）+ 未读数
 *   2. 能做什么？→ 选章节 / 选任务读取剧本，逐条「标记已读」
 *   3. 读到了什么？→ `StoryTimeline` 按序展示节点文本与未读/已读状态
 *
 * 协议字段不上屏：`nodeKey` 只做 key、`type` 映射中文标签（`StoryTimeline` 负责）、
 * `questCode` join 成任务名。容器模式：不在挂载时拉取；三态交给 `AsyncBoundary`，
 * 目录区不参与三态（否则空态下玩家无法选择剧本）。
 */
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { Button, Col, Flex, Row, Typography } from 'antd';
import { AsyncBoundary, SectionCard, StoryTimeline } from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { StoryDirectory, type StorySelection } from './story/StoryDirectory.js';
import { questScriptTitle, toNodeViews, unreadCount } from './story/presentation.js';

export const StoryPanel = observer(function StoryPanel() {
  const root = useRootStore();
  const { story, quest } = root;
  const [selected, setSelected] = useState<StorySelection | null>(null);
  const chapter = story.chapter;

  /** 选章节 / 选任务：记住选择，并按来源拉取剧本。 */
  function select(selection: StorySelection): void {
    setSelected(selection);
    if (selection.kind === 'chapter') {
      void story.loadChapter(selection.id);
    } else {
      void story.loadQuest(selection.id);
    }
  }

  /** 刷新 / 错误重试：有选择时重拉该剧本，否则退回 `load()`（按已加载章节重拉）。 */
  function reload(): void {
    if (selected === null) {
      void story.load();
      return;
    }
    select(selected);
  }

  const markSeen = (nodeKey: string): void => void story.markSeen(nodeKey);
  const empty = chapter === null && story.nodes.length === 0 && story.questNodes.length === 0;
  const unread = unreadCount(story.nodes);
  const chapterHeading = chapter === null ? '章节剧本' : `章节剧本 · ${chapter.name}`;

  return (
    <SectionCard
      title="剧情"
      subtitle={chapter === null ? '从左侧目录选择章节或任务，阅读剧本' : `第 ${chapter.chapter} 章 · ${chapter.name}`}
      extra={
        <Button onClick={reload} data-testid="story-refresh">
          刷新剧情
        </Button>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={7}>
          <div data-testid="story-directory">
            <StoryDirectory
              chapters={quest.chapters}
              quests={quest.quests}
              selected={selected}
              onSelect={select}
            />
          </div>
        </Col>

        <Col xs={24} md={17}>
          <AsyncBoundary
            loading={story.loading}
            error={story.error}
            empty={empty}
            emptyText="从左侧目录选择章节或任务开始阅读"
            onRetry={reload}
          >
            <Flex vertical gap={12}>
              <Flex vertical gap={4} data-testid="story-chapter-timeline">
                <Typography.Text strong>
                  {unread > 0 ? `${chapterHeading}（未读 ${unread}）` : chapterHeading}
                </Typography.Text>
                <StoryTimeline
                  nodes={toNodeViews(story.nodes, markSeen)}
                  emptyText="本章暂无剧情节点"
                />
              </Flex>

              {story.questNodes.length === 0 ? null : (
                <Flex vertical gap={4} data-testid="story-quest-timeline">
                  <Typography.Text strong>
                    {questScriptTitle(story.questNodes, quest.quests)}
                  </Typography.Text>
                  <StoryTimeline
                    nodes={toNodeViews(story.questNodes, markSeen)}
                    emptyText="该任务暂无剧情节点"
                  />
                </Flex>
              )}
            </Flex>
          </AsyncBoundary>
        </Col>
      </Row>
    </SectionCard>
  );
});
