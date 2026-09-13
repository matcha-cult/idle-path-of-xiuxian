/**
 * StoryTimeline —— 剧本节点时间线，游戏语义通用组。
 *
 * 用途：剧情面板按时间顺序展示章节开场/收尾、任务开始/完成等节点及其未读状态。
 * 约定：
 * - 用 antd `Timeline` 的 **`items` API**（`children` / `Timeline.Item` / `pending` 在 v6 已弃用）；
 *   节点主内容放 `content`（**不要**放 `title`：v6 里纵向时间线一旦有 `title` 会切成 alternate 双栏布局）；
 * - 节点级 `content` 内用 `Flex` + `Typography` + `Tag` 组合；
 * - 圆点颜色只用 `Timeline` 预设色名（`blue` / `gray`），禁止内联 hex；
 * - 受控：`onSeen` / `onClick` 只回调，组件**不**自行改已读状态；
 * - 纯展示、无副作用，不 import 任何业务包。
 *
 * 边界：`nodes=[]` → `emptyText`（缺省「暂无剧情」）；`loading` → `Skeleton` 且不渲染节点；
 *       `seen` 未传按未读处理；`text` 为空串照常渲染不崩；未知 `type` 原样显示。
 */
import { Button, Flex, Skeleton, Tag, Timeline, Typography, theme } from 'antd';
import type { KeyboardEvent, ReactNode } from 'react';

export interface StoryNodeView {
  nodeKey: string;
  /** 'chapter_intro' | 'chapter_outro' | 'quest_start' | 'quest_done' | string */
  type?: string;
  text: string;
  seen?: boolean;
  onClick?: () => void;
  /** 是否显示「标记已读」入口。 */
  onSeen?: () => void;
}

export interface StoryTimelineProps {
  nodes: readonly StoryNodeView[];
  loading?: boolean;
  emptyText?: ReactNode;
  /** 是否显示未读/已读状态，缺省 true。 */
  showSeen?: boolean;
}

/** 已知节点类型 → 中文标签（未知类型原样显示，空串省略）。 */
const TYPE_LABELS: Record<string, string> = {
  chapter_intro: '章节·序',
  chapter_outro: '章节·终',
  quest_start: '任务·始',
  quest_done: '任务·终',
};

/** 未读 / 已读的时间线圆点色（`Timeline` 只认 blue|red|green|gray 这四个预设名）。 */
const UNREAD_DOT_COLOR = 'blue';
const READ_DOT_COLOR = 'gray';

/** Enter / Space 触发点击（与原生 button 行为一致）。 */
function activateOnKey(event: KeyboardEvent<HTMLElement>, action: () => void): void {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault();
    action();
  }
}

/** 节点文本：有 `onClick` 时渲染为可键盘触发的按钮语义。 */
function renderText(node: StoryNodeView, secondary: boolean): ReactNode {
  const onClick = node.onClick;
  if (onClick === undefined) {
    return (
      <Typography.Text type={secondary ? 'secondary' : undefined} data-testid="story-timeline-text">
        {node.text}
      </Typography.Text>
    );
  }
  return (
    <Typography.Text
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        activateOnKey(event, onClick);
      }}
      data-testid="story-timeline-text"
    >
      {node.text}
    </Typography.Text>
  );
}

export function StoryTimeline(props: StoryTimelineProps) {
  const { nodes, loading, emptyText, showSeen = true } = props;
  const { token } = theme.useToken();

  if (loading) {
    // antd `Skeleton` 的 props 不含原生 DOM 属性，因此测试标记挂在外层 `Flex` 上。
    return (
      <Flex data-testid="story-timeline-loading" vertical>
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      </Flex>
    );
  }

  if (nodes.length === 0) {
    return (
      <Typography.Text type="secondary" data-testid="story-timeline-empty">
        {emptyText ?? '暂无剧情'}
      </Typography.Text>
    );
  }

  const items = nodes.map((node) => {
    const unread = node.seen !== true;
    const type = node.type;
    const typeText = type === undefined || type === '' ? null : TYPE_LABELS[type] ?? type;
    const onSeen = node.onSeen;
    return {
      key: node.nodeKey,
      color: showSeen && unread ? UNREAD_DOT_COLOR : READ_DOT_COLOR,
      content: (
        <Flex
          vertical
          gap={token.marginXXS}
          data-testid="story-timeline-node"
          data-node-key={node.nodeKey}
          data-unread={unread ? 'true' : 'false'}
        >
          <Flex align="center" wrap gap={token.marginXXS}>
            {typeText === null ? null : <Tag data-testid="story-timeline-type">{typeText}</Tag>}
            {showSeen ? (
              unread ? (
                <Tag color="processing" data-testid="story-timeline-unread">
                  未读
                </Tag>
              ) : (
                <Tag data-testid="story-timeline-seen">已读</Tag>
              )
            ) : null}
          </Flex>
          {renderText(node, showSeen && !unread)}
          {onSeen === undefined ? null : (
            <Button type="link" onClick={onSeen} data-testid="story-timeline-mark-seen">
              标记已读
            </Button>
          )}
        </Flex>
      ),
    };
  });

  return <Timeline data-testid="story-timeline-root" items={items} />;
}
