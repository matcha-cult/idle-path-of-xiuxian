/**
 * IdleTargetBar —— 挂机点摘要条（§23 ①）。
 *
 * 一行回答「我现在的挂机点是哪个 / 要不要换 / 是不是被暂停了」：
 * - 已设置 → `挂机点：青云山` + 「更换挂机点」；
 * - 未设置 → `未设置挂机点` + 「选择挂机点」；
 * - 在线战斗中 → 额外的「已暂停」标签（挂机被互斥闸门拒绝，不是错误）。
 *
 * 纯展示、受控：不查数据、不发请求；选择动作交给 `onOpenPicker`（由容器开 `IdleTargetPicker`）。
 */
import { Button, Flex, Space, Tag } from 'antd';

export interface IdleTargetBarProps {
  /** 当前挂机点中文名；null = 未设置 / 已失效 */
  targetName: string | null;
  /** 可挂机的已突破秘境数量（0 = 还没有可选项，按钮禁用） */
  availableCount: number;
  /** 是否正在在线战斗中（挂机暂停） */
  paused: boolean;
  onOpenPicker: () => void;
}

export function IdleTargetBar(props: IdleTargetBarProps) {
  const { targetName, availableCount, paused, onOpenPicker } = props;
  return (
    <Flex align="center" justify="space-between" gap={8} wrap>
      <Space wrap size={4}>
        <Tag color={targetName === null ? 'default' : 'green'} data-testid="idle-target-state">
          {targetName === null ? '未设置挂机点' : `挂机点：${targetName}`}
        </Tag>
        {paused ? (
          <Tag color="warning" data-testid="idle-target-paused">
            已暂停：在线战斗中
          </Tag>
        ) : null}
      </Space>
      <Button onClick={onOpenPicker} disabled={availableCount <= 0} data-testid="idle-target-pick">
        {targetName === null ? '选择挂机点' : '更换挂机点'}
      </Button>
    </Flex>
  );
}
