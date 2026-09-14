/**
 * `LabObjectRow` —— 可交互对象列表的**一行**（点它 = 选中宿主枢纽）。
 *
 * 「进入地图之后加载可交互对象，PC 端左边地图网格、右边地图内可交互对象」是用户的原始形态
 * 要求；这一行就是「右边」的原子。点行不直接动作、只把画布焦点移到宿主枢纽 —— 与
 * 「点击枢纽只选中」同一原则（先看，再决定），避免在列表里误触移动。
 *
 * 纯展示 + 回调；协议 code 只做 key/testid，不上屏（`LAB_KIND_LABELS` 给中文）。
 */
import { Button, Flex, Tag, Typography } from 'antd';
import { LAB_KIND_LABELS, type LabObject } from './lab-objects.js';

export interface LabObjectRowProps {
  object: LabObject;
  /** 是否属于当前选中的枢纽（加「此处」标记）。 */
  onSelectedNode: boolean;
  onFocusNode: (nodeCode: string) => void;
}

export function LabObjectRow(props: LabObjectRowProps) {
  const { object, onSelectedNode, onFocusNode } = props;
  return (
    <Flex gap={8} align="center" wrap data-testid={`map-lab-object-${object.key}`}>
      <Button
        type="link"
        data-testid={`map-lab-object-focus-${object.key}`}
        onClick={() => onFocusNode(object.nodeCode)}
      >
        {object.name}
      </Button>
      <Tag>{LAB_KIND_LABELS[object.kind]}</Tag>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {object.nodeName}
      </Typography.Text>
      {object.done ? (
        <Tag color="success" data-testid={`map-lab-object-done-${object.key}`}>
          已点亮
        </Tag>
      ) : null}
      {onSelectedNode ? (
        <Tag color="processing" data-testid={`map-lab-object-here-${object.key}`}>
          此处
        </Tag>
      ) : null}
    </Flex>
  );
}
