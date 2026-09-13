/**
 * ConfirmAction —— 危险/不可逆操作的二次确认触发器。
 *
 * 用途：把「触发元素」与「确认气泡」绑在一起，避免调用方各自散落 `Modal.confirm`
 * （静态方法脱离 React 树、拿不到主题与 Context，且无法随组件卸载而清理）。
 *
 * 实现：antd `Popconfirm`；`onConfirm` 返回 Promise 时，确认按钮通过 `okButtonProps.loading`
 * 呈现进行中态，防止重复提交。
 * 插槽：`children` 必须是可承接点击事件的单个元素（通常是 antd Button）。
 * 边界：`disabled` 时气泡不弹出；`onConfirm` 同步抛错不会被吞（直接冒泡给上层 ErrorBoundary）。
 * 受控、无副作用、不发请求。
 */
import { Popconfirm, Space } from 'antd';
import { useState } from 'react';
import type { ReactNode } from 'react';

export interface ConfirmActionProps {
  /** 确认气泡标题。 */
  title: ReactNode;
  /** 补充说明，展示在标题下方。 */
  description?: ReactNode;
  /** 确认回调；返回 Promise 时按钮进入 loading。 */
  onConfirm: () => void | Promise<void>;
  /** 确认按钮文案，缺省「确定」。 */
  okText?: ReactNode;
  /** 取消按钮文案，缺省「取消」。 */
  cancelText?: ReactNode;
  /** 危险语义（确认按钮标红）。 */
  danger?: boolean;
  /** 禁用后点击触发元素不弹气泡。 */
  disabled?: boolean;
  /** 触发元素。 */
  children: ReactNode;
}

export function ConfirmAction(props: ConfirmActionProps) {
  const { title, description, onConfirm, okText, cancelText, danger, disabled, children } = props;
  const [loading, setLoading] = useState(false);

  const handleConfirm = () => {
    const result = onConfirm();
    // 仅当回调真正返回 thenable 时才进入 loading，避免同步回调闪一下。
    if (result && typeof (result as Promise<void>).then === 'function') {
      setLoading(true);
      void Promise.resolve(result).finally(() => {
        setLoading(false);
      });
    }
  };

  return (
    <Popconfirm
      title={title}
      description={description}
      okText={okText ?? '确定'}
      cancelText={cancelText ?? '取消'}
      disabled={disabled}
      onConfirm={handleConfirm}
      okButtonProps={{ loading, danger }}
    >
      <Space data-testid="confirm-action-root">{children}</Space>
    </Popconfirm>
  );
}
