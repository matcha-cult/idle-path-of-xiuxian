/**
 * QuestCard —— 单个任务卡（从 QuestPanel 拆出，保持单文件规模与单一职责）。
 *
 * 只展示玩家判断「我现在该做什么、还差多少」需要的信息：名称 / 状态 / 是否可结算 /
 * 目标进度。协议字段不上屏：`code` 只做 key 与 testid，`objectives[].type/key` 与
 * `orderIndex` 不展示（目标描述用服务端渲染好的 `desc`）。
 */
import { Card, Flex, Progress, Tag, Typography } from 'antd';
import type { ObjectiveProgress, QuestView } from '@idle-path/ionet-transport';
import {
  objectivePercent,
  objectiveProgressText,
  questStatusColor,
  questStatusLabel,
} from './presentation.js';

/** 单条目标行：描述 + 进度文案 + 进度条（`done` 用成功色）。 */
function ObjectiveRow({ objective }: { objective: ObjectiveProgress }) {
  const done = objective.done === true;
  return (
    <Flex vertical gap={2}>
      <Flex justify="space-between" gap={8}>
        <Typography.Text>{objective.desc}</Typography.Text>
        <Typography.Text type={done ? 'success' : 'secondary'}>
          {objectiveProgressText(objective)}
        </Typography.Text>
      </Flex>
      <Progress percent={objectivePercent(objective)} showInfo={false} status={done ? 'success' : 'active'} />
    </Flex>
  );
}

export interface QuestCardProps {
  quest: QuestView;
}

export function QuestCard({ quest }: QuestCardProps) {
  return (
    <Card
      data-testid={`quest-card-${quest.code}`}
      variant="outlined"
      title={
        <Flex align="center" wrap gap={8}>
          <span>{quest.name}</span>
          <Tag color={questStatusColor(quest.status)}>{questStatusLabel(quest.status)}</Tag>
          {quest.claimable ? <Tag color="gold">可结算</Tag> : null}
        </Flex>
      }
    >
      {quest.objectives.length === 0 ? (
        <Typography.Text type="secondary">无附加条件，达成后即可结算</Typography.Text>
      ) : (
        <Flex vertical gap={8} data-testid={`quest-objectives-${quest.code}`}>
          {quest.objectives.map((objective, index) => (
            <ObjectiveRow key={`objective-${index}`} objective={objective} />
          ))}
        </Flex>
      )}
    </Card>
  );
}
