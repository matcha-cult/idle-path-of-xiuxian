/**
 * ModalForm —— 弹窗内嵌的动作表单（Modal + ActionForm）。
 *
 * 用途：需要「先弹窗、再填表、确认提交」的场景，复用 `ActionForm` 的 schema 渲染，
 * 避免弹窗表单再复制一套字段拼装逻辑。
 * 实现：`Modal` 使用 `footer={null}`，提交/取消按钮由内部 `ActionForm` 提供；
 * 提交按钮是 `htmlType="submit"`，点击即触发表单校验与 `onFinish`。
 * 插槽：`title` / `confirmText` / `cancelText` 均为 ReactNode。
 * 边界：`open=false` 时不渲染表单；`destroyOnHidden` 保证关闭后表单状态被销毁，
 * 下次打开是干净的初值。
 * 受控、无副作用、不发请求；不传 `size`。
 */
import { Modal } from 'antd';
import type { ReactNode } from 'react';
import type { ActionField } from '../ActionForm/index.js';
import { ActionForm } from '../ActionForm/index.js';

export interface ModalFormProps {
  /** 是否打开。 */
  open: boolean;
  /** 弹窗标题。 */
  title: ReactNode;
  /** 字段声明数组（判别联合，透传给 ActionForm）。 */
  fields: readonly ActionField[];
  /** 表单初值。 */
  initialValues?: Record<string, unknown>;
  /** 确认按钮文案，缺省「提交」。 */
  confirmText?: ReactNode;
  /** 取消按钮文案，缺省「取消」。 */
  cancelText?: ReactNode;
  /** 提交中：确认按钮 loading。 */
  loading?: boolean;
  /** 弹窗宽度。 */
  width?: number;
  /** 取消/关闭回调（点遮罩、右上角 X、取消按钮均走这里）。 */
  onCancel: () => void;
  /** 校验通过后的提交回调。 */
  onFinish: (values: Record<string, unknown>) => void | Promise<void>;
}

export function ModalForm(props: ModalFormProps) {
  const { open, title, fields, initialValues, confirmText, cancelText, loading, width, onCancel, onFinish } = props;

  return (
    <Modal
      open={open}
      title={title}
      width={width}
      onCancel={onCancel}
      footer={null}
      destroyOnHidden
      data-testid="modal-form-root"
    >
      <ActionForm
        fields={fields}
        initialValues={initialValues}
        submitText={confirmText}
        cancelText={cancelText}
        loading={loading}
        onFinish={onFinish}
        onCancel={onCancel}
      />
    </Modal>
  );
}
