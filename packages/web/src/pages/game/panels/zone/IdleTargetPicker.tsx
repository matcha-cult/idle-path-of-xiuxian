/**
 * IdleTargetPicker —— 挂机点选择器（§23 ① G1/G5）。
 *
 * 只有**已突破 ∧ 可挂机**的秘境会出现在选项里（由容器用 `idleTargetOptions` 筛好）：
 * 特殊秘境不进列表，因为服务端会以 `ZONE_NOT_IDLE_ELIGIBLE` 拒绝 —— 前端不提供必败入口。
 *
 * 纯受控：`open` / `value` / `busy` 全由父级给，组件只用一份**本地草稿选中态**
 * （打开时从 `value` 重置，`value` 缺失时取第一项），确认时才回调 `onConfirm`。
 * 点「取消」或关闭不产生任何副作用。
 */
import { useEffect, useState } from 'react';
import { Flex, Modal, Radio, Space, Tag, Typography } from 'antd';
import { EmptyHint } from '@idle-path/ui-kit';
import type { IdleTargetOption } from './presentation.js';

export interface IdleTargetPickerProps {
  open: boolean;
  /** 可选项（已筛掉不可挂机的秘境）；空数组时给指路空态 */
  options: readonly IdleTargetOption[];
  /** 当前挂机点 code（null = 未设置） */
  value: string | null;
  /** 确认中（按钮 loading） */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (code: string) => void;
}

export function IdleTargetPicker(props: IdleTargetPickerProps) {
  const { open, options, value, busy = false, onCancel, onConfirm } = props;
  const [draft, setDraft] = useState<string | null>(null);

  // 每次打开都用最新数据重置草稿，避免上次的选中粘住（取消后重开必须回到当前值）。
  useEffect(() => {
    if (!open) return;
    setDraft(value ?? options[0]?.code ?? null);
  }, [open, value, options]);

  return (
    <Modal
      open={open}
      title="选择挂机点"
      okText="设为挂机点"
      cancelText="取消"
      confirmLoading={busy}
      okButtonProps={{ disabled: draft === null }}
      onOk={() => {
        if (draft !== null) onConfirm(draft);
      }}
      onCancel={onCancel}
      destroyOnHidden
    >
      {options.length === 0 ? (
        <EmptyHint
          compact
          description="暂无可挂机的秘境：先到地图「第八峰·后山」的秘境石台突破一个历练秘境"
        />
      ) : (
        <Radio.Group
          orientation="vertical"
          value={draft}
          onChange={(event) => setDraft(String(event.target.value))}
          data-testid="idle-target-options"
        >
          <Flex vertical gap={8}>
            {options.map((option) => (
              <Radio key={option.code} value={option.code}>
                <Space wrap size={4} data-testid={`idle-target-option-${option.code}`}>
                  <span>{option.name}</span>
                  <Tag>第 {option.realm} 境</Tag>
                  <Typography.Text type="secondary">{option.detail}</Typography.Text>
                  {option.code === value ? <Tag color="green">当前</Tag> : null}
                </Space>
              </Radio>
            ))}
          </Flex>
        </Radio.Group>
      )}
    </Modal>
  );
}
