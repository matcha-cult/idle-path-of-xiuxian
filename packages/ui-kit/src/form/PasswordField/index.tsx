/**
 * PasswordField —— 口令输入字段（`Form.Item` + `Input.Password` 的绑定封装）。
 *
 * 为什么单独成组件而不是给 `TextField` 加 `type` 开关：口令框需要 antd 的
 * `Input.Password`（可见性切换、`visibilityToggle`），与纯文本输入是两种控件；
 * 用布尔开关会让 `TextField` 承担两种职责（规划 09 §6.3 规则 1 的取向）。
 *
 * 边界：无外层 `Form` 时仍可单独渲染；`required` 不覆盖传入 `rules`，只在末尾追加必填规则。
 * 受控、无副作用；不传 `size`（全局紧凑算法已生效）。
 */
import { Form, Input } from 'antd';
import type { FormItemProps } from 'antd';
import type { ReactNode } from 'react';

export interface PasswordFieldProps {
  /** 字段名（`Form.Item name`）。 */
  name: string;
  /** 标签。 */
  label?: ReactNode;
  /** 占位文案。 */
  placeholder?: string;
  /** 必填：追加 `{ required: true, message: '请输入' }`。 */
  required?: boolean;
  /** 最小长度（仅作为额外规则，不覆盖 `rules`）。 */
  minLength?: number;
  /** 最大长度。 */
  maxLength?: number;
  /** 禁用。 */
  disabled?: boolean;
  /** 标签右侧问号提示。 */
  tooltip?: ReactNode;
  /** 额外校验规则，追加在必填/长度规则之前。 */
  rules?: FormItemProps['rules'];
  /** 辅助/错误文案（受控展示，不参与校验）。 */
  help?: ReactNode;
}

export function PasswordField(props: PasswordFieldProps) {
  const { name, label, placeholder, required, minLength, maxLength, disabled, tooltip, rules, help } =
    props;

  const mergedRules: FormItemProps['rules'] = [...(rules ?? [])];
  if (required) mergedRules.push({ required: true, message: '请输入' });
  if (minLength !== undefined) {
    mergedRules.push({ min: minLength, message: `至少 ${minLength} 个字符` });
  }

  return (
    <Form.Item
      name={name}
      label={label}
      tooltip={tooltip}
      help={help}
      rules={mergedRules.length > 0 ? mergedRules : undefined}
    >
      <Input.Password
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        data-testid={`password-field-${name}`}
      />
    </Form.Item>
  );
}
