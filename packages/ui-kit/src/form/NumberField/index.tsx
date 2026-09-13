/**
 * NumberField —— 数字输入字段（`Form.Item` + `InputNumber`）。
 *
 * 用途：数值型表单的标准封装，`min` / `max` / `step` / `precision` 直接透传 antd，
 * 不在本层做额外钳制（钳制属于业务语义）。
 * 插槽：`label` / `help` / `addonAfter` 均为 ReactNode。
 * 边界：`min > max` 或非有限数不抛错，照传 antd 由其自行处理；无外层 `Form` 也能渲染。
 * 受控、无副作用、不发请求；不传 `size`。
 */
import { Form, InputNumber } from 'antd';
import type { FormItemProps } from 'antd';
import type { ReactNode } from 'react';

export interface NumberFieldProps {
  /** 字段名（`Form.Item name`）。 */
  name: string;
  /** 标签。 */
  label?: ReactNode;
  /** 最小值（透传，不做钳制）。 */
  min?: number;
  /** 最大值（透传，不做钳制）。 */
  max?: number;
  /** 步长。 */
  step?: number;
  /** 小数精度。 */
  precision?: number;
  /** 必填：追加 `{ required: true, message: '请输入' }`。 */
  required?: boolean;
  /** 禁用。 */
  disabled?: boolean;
  /** 占位文案。 */
  placeholder?: string;
  /** 额外校验规则。 */
  rules?: FormItemProps['rules'];
  /** 辅助/错误文案。 */
  help?: ReactNode;
  /** 输入框后缀内容（单位等）。 */
  addonAfter?: ReactNode;
}

export function NumberField(props: NumberFieldProps) {
  const { name, label, min, max, step, precision, required, disabled, placeholder, rules, help, addonAfter } = props;
  const mergedRules = required ? [...(rules ?? []), { required: true, message: '请输入' }] : rules;

  return (
    <Form.Item name={name} label={label} help={help} rules={mergedRules}>
      <InputNumber
        min={min}
        max={max}
        step={step}
        precision={precision}
        placeholder={placeholder}
        disabled={disabled}
        addonAfter={addonAfter}
        data-testid={`number-field-${name}`}
      />
    </Form.Item>
  );
}
