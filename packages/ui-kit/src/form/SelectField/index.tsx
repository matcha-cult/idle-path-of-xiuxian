/**
 * SelectField —— 下拉选择字段（`Form.Item` + `Select`）。
 *
 * 用途：选项列表驱动的选择控件；`options` 只读数组，便于业务侧用 `as const` 收窄字面量。
 * 插槽：`label` / `help` 为 ReactNode；`options[].label` 亦为 ReactNode。
 * 边界：`options=[]` 仍正常渲染不崩；`mode` 缺省为单选；无外层 `Form` 也能渲染。
 * 受控、无副作用、不发请求；不传 `size`。
 */
import { Form, Select } from 'antd';
import type { FormItemProps } from 'antd';
import type { ReactNode } from 'react';

/** 选择项：值类型限定为 string | number，避免对象值带来的隐式序列化。 */
export interface SelectOption {
  label: ReactNode;
  value: string | number;
  disabled?: boolean;
}

export interface SelectFieldProps {
  /** 字段名（`Form.Item name`）。 */
  name: string;
  /** 标签。 */
  label?: ReactNode;
  /** 选项列表（可为空数组）。 */
  options: readonly SelectOption[];
  /** 必填：追加 `{ required: true, message: '请选择' }`。 */
  required?: boolean;
  /** 禁用。 */
  disabled?: boolean;
  /** 占位文案。 */
  placeholder?: string;
  /** 允许清空。 */
  allowClear?: boolean;
  /** 多选/标签模式；缺省单选。 */
  mode?: 'multiple' | 'tags';
  /** 额外校验规则。 */
  rules?: FormItemProps['rules'];
  /** 辅助/错误文案。 */
  help?: ReactNode;
}

export function SelectField(props: SelectFieldProps) {
  const { name, label, options, required, disabled, placeholder, allowClear, mode, rules, help } = props;
  const mergedRules = required ? [...(rules ?? []), { required: true, message: '请选择' }] : rules;

  return (
    <Form.Item name={name} label={label} help={help} rules={mergedRules}>
      <Select
        // 只读数组展开为可变数组：antd 的 options 形参不是 readonly。
        options={[...options]}
        mode={mode}
        placeholder={placeholder}
        allowClear={allowClear}
        disabled={disabled}
        data-testid={`select-field-${name}`}
      />
    </Form.Item>
  );
}
