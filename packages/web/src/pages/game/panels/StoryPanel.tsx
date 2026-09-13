/**
 * StoryPanel —— 剧情（story 段）。
 *
 * 容器模式（与 BagPanel 一致）：只做「store 状态 → ui-kit 组件 props」映射，不写业务规则；
 * 不在挂载时自动拉取（首屏由 `RootStore.loadPanel()` 统一加载）；
 * 三态（loading/error/empty/onRetry）交给 `AsyncBoundary`。
 */
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Flex, Input, Space } from 'antd';
import type { TableProps } from 'antd';
import type { StoryNode } from '@idle-path/ionet-transport';
import { AsyncBoundary, DataTable, SectionCard, Toolbar } from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';

type StoryColumns = NonNullable<TableProps<StoryNode>['columns']>;

const NODE_COLUMNS: StoryColumns = [
  { title: '节点', dataIndex: 'nodeKey', key: 'nodeKey' },
  { title: '类型', dataIndex: 'type', key: 'type' },
  { title: '文本', dataIndex: 'text', key: 'text' },
  {
    title: '状态',
    dataIndex: 'seen',
    key: 'seen',
    render: (seen: boolean) => (seen ? '已读' : '未读'),
  },
];

export const StoryPanel = observer(function StoryPanel() {
  const { story } = useRootStore();
  const [chapter, setChapter] = useState('1');
  const [quest, setQuest] = useState('');

  const rowActions = (node: StoryNode) => (
    <Button onClick={() => void story.markSeen(node.nodeKey)} data-testid={`story-seen-${node.nodeKey}`}>
      标记已读
    </Button>
  );

  return (
    <SectionCard
      title="剧情"
      subtitle={
        story.chapter === null
          ? '未加载章节'
          : `第 ${story.chapter.chapter} 章 · ${story.chapter.name}（${story.chapter.code}）`
      }
      extra={
        <Button onClick={() => void story.load()} data-testid="story-refresh">
          刷新剧情
        </Button>
      }
    >
      <Toolbar
        left={
          <Space wrap>
            <Input
              value={chapter}
              onChange={(event) => setChapter(event.target.value)}
              placeholder="章节序号或 code"
              data-testid="story-chapter-input"
            />
            <Button onClick={() => void story.loadChapter(chapter)} data-testid="story-load-chapter">
              加载章节
            </Button>
            <Input
              value={quest}
              onChange={(event) => setQuest(event.target.value)}
              placeholder="任务 code"
              data-testid="story-quest-input"
            />
            <Button onClick={() => void story.loadQuest(quest)} data-testid="story-load-quest">
              加载任务
            </Button>
          </Space>
        }
        right={
          <span data-testid="story-node-count">
            章节 {story.nodes.length} · 任务 {story.questNodes.length}
          </span>
        }
      />

      <AsyncBoundary
        loading={story.loading}
        error={story.error}
        empty={story.nodes.length === 0 && story.questNodes.length === 0}
        emptyText="暂无剧情节点，先加载章节或任务"
        onRetry={() => void story.load()}
      >
        <Flex vertical gap={12}>
          <DataTable<StoryNode>
            columns={NODE_COLUMNS}
            dataSource={story.nodes}
            rowKey="nodeKey"
            title="章节节点"
            emptyText="本章暂无剧情节点"
            rowActions={rowActions}
          />
          {story.questNodes.length === 0 ? null : (
            <DataTable<StoryNode>
              columns={NODE_COLUMNS}
              dataSource={story.questNodes}
              rowKey="nodeKey"
              title="任务节点"
              emptyText="该任务暂无剧情节点"
              rowActions={rowActions}
            />
          )}
        </Flex>
      </AsyncBoundary>
    </SectionCard>
  );
});
