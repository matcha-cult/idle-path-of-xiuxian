/**
 * TextField —— 文本输入字段（`Form.Item` + `Input` 的绑定封装）。
 *
 * 用途：把 `name` / `label` / `rules` / `help` / `tooltip` 的组合收敛成一个组件，
 * 让业务表单只声明字段语义，不重复拼装 `Form.Item`。
 * 插槽：`label` / `tooltip` / `help` 均为 ReactNode。
 * 边界：无外层 `Form` 时仍能单独渲染（`Form.Item` 自身可用，只是不参与校验/收集）；
 * `required` 不覆盖传入的 `rules`，只在末尾追加一条必填规则。
 * 受控、无副作用、不发请求；不传 `size`（全局紧凑算法已生效）。
 */
import { Form, Input } from 'antd';
import type { FormItemProps } from 'antd';
import type { ReactNode } from 'react';

export interface TextFieldProps {
  /** 字段名（`Form.Item name`）。 */
  name: string;
  /** 标签。 */
  label?: ReactNode;
  /** 占位文案。 */
  placeholder?: string;
  /** 必填：追加 `{ required: true, message: '请输入' }`。 */
  required?: boolean;
  /** 最大长度。 */
  maxLength?: number;
  /** 禁用。 */
  disabled?: boolean;
  /** 标签右侧问号提示。 */
  tooltip?: ReactNode;
  /** 额外校验规则，追加在必填规则之前。 */
  rules?: FormItemProps['rules'];
  /** 辅助/错误文案（受控展示，不参与校验）。 */
  help?: ReactNode;
}

export function TextField(props: TextFieldProps) {
  const { name, label, placeholder, required, maxLength, disabled, tooltip, rules, help } = props;
  const mergedRules = required ? [...(rules ?? []), { required: true, message: '请输入' }] : rules;

  return (
    <Form.Item name={name} label={label} tooltip={tooltip} help={help} rules={mergedRules}>
      <Input
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        data-testid={`text-field-${name}`}
      />
    </Form.Item>
  );
}
