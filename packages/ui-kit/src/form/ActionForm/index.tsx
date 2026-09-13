/**
 * ActionForm —— schema 驱动的动作表单。
 *
 * 用途：把「字段声明数组」直接渲染成一张可提交的表单，业务侧只需给出
 * `ActionField[]` 与 `onFinish`，无需为每个页面重复拼 `Form.Item`。
 * 字段是**判别联合**：`kind` 决定用哪个字段组件，且各分支的 props 与对应
 * 字段组件逐字一致（`kind` 之外的 props 直接透传）。
 *
 * 插槽：`submitText` / `cancelText` 覆盖按钮文案；`onCancel` 存在时才渲染取消按钮。
 * 边界：`fields=[]` 只渲染动作区；`initialValues` 原样交给 antd（未列出的键不会出现在提交值里）。
 * 受控、无副作用、不发请求；不传 `size`。
 */
import { Button, Form, Space } from 'antd';
import type { ReactNode } from 'react';
import { SubmitButton } from '../../feedback/SubmitButton/index.js';
import type { NumberFieldProps } from '../NumberField/index.js';
import { NumberField } from '../NumberField/index.js';
import type { SelectFieldProps } from '../SelectField/index.js';
import { SelectField } from '../SelectField/index.js';
import type { SwitchFieldProps } from '../SwitchField/index.js';
import { SwitchField } from '../SwitchField/index.js';
import type { TextFieldProps } from '../TextField/index.js';
import { TextField } from '../TextField/index.js';

/** 动作表单的字段判别联合：`kind` 为判别键，其余 props 与字段组件一致。 */
export type ActionField =
  | ({ kind: 'text' } & TextFieldProps)
  | ({ kind: 'number' } & NumberFieldProps)
  | ({ kind: 'select' } & SelectFieldProps)
  | ({ kind: 'switch' } & SwitchFieldProps);

export interface ActionFormProps {
  /** 字段声明数组（判别联合）。 */
  fields: readonly ActionField[];
  /** 表单初值（键为字段 name）。 */
  initialValues?: Record<string, unknown>;
  /** 提交按钮文案，缺省「提交」。 */
  submitText?: ReactNode;
  /** 取消按钮文案，缺省「取消」；仅当传了 `onCancel` 时渲染。 */
  cancelText?: ReactNode;
  /** 提交中：提交按钮 loading 且取消按钮禁用。 */
  loading?: boolean;
  /** 整表禁用。 */
  disabled?: boolean;
  /** 布局，缺省 vertical。 */
  layout?: 'horizontal' | 'vertical' | 'inline';
  /** 校验通过后的提交回调。 */
  onFinish: (values: Record<string, unknown>) => void | Promise<void>;
  /** 取消回调；传入即显示取消按钮。 */
  onCancel?: () => void;
}

/** 按 `kind` 渲染对应字段组件（`kind` 自身不透传给控件）。 */
function renderField(field: ActionField): ReactNode {
  switch (field.kind) {
    case 'text': {
      const { kind: _kind, ...rest } = field;
      return <TextField key={field.name} {...rest} />;
    }
    case 'number': {
      const { kind: _kind, ...rest } = field;
      return <NumberField key={field.name} {...rest} />;
    }
    case 'select': {
      const { kind: _kind, ...rest } = field;
      return <SelectField key={field.name} {...rest} />;
    }
    case 'switch': {
      const { kind: _kind, ...rest } = field;
      return <SwitchField key={field.name} {...rest} />;
    }
    default:
      // 判别联合已被穷尽；保留兜底以免未来新增 kind 时静默渲染空白。
      return null;
  }
}

export function ActionForm(props: ActionFormProps) {
  const {
    fields,
    initialValues,
    submitText,
    cancelText,
    loading,
    disabled,
    layout = 'vertical',
    onFinish,
    onCancel,
  } = props;

  return (
    <Form
      layout={layout}
      initialValues={initialValues}
      onFinish={onFinish}
      disabled={disabled}
      data-testid="action-form-root"
    >
      {fields.map(renderField)}
      <Form.Item label={null}>
        <Space data-testid="action-form-actions">
          <SubmitButton htmlType="submit" loading={loading}>
            {submitText ?? '提交'}
          </SubmitButton>
          {onCancel ? (
            <Button onClick={onCancel} disabled={loading}>
              {cancelText ?? '取消'}
            </Button>
          ) : null}
        </Space>
      </Form.Item>
    </Form>
  );
}
