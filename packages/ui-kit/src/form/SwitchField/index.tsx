/**
 * SwitchField —— 开关字段（`Form.Item valuePropName="checked"` + `Switch`）。
 *
 * 用途：布尔型字段的标准封装。**必须** `valuePropName="checked"`，否则 antd 会把值绑到
 * `value` 上，导致开关键始终不反映表单值（这是本组件存在的核心理由）。
 * 插槽：`label` / `checkedChildren` / `unCheckedChildren` 均为 ReactNode。
 * 边界：无外层 `Form` 也能渲染；`rules` 原样透传（如需要必填由调用方声明
 * `{ required: true, message: '请选择' }`）。
 * 受控、无副作用、不发请求；不传 `size`。
 */
import { Form, Switch } from 'antd';
import type { FormItemProps } from 'antd';
import type { ReactNode } from 'react';

export interface SwitchFieldProps {
  /** 字段名（`Form.Item name`）。 */
  name: string;
  /** 标签。 */
  label?: ReactNode;
  /** 禁用。 */
  disabled?: boolean;
  /** 开态内嵌文案。 */
  checkedChildren?: ReactNode;
  /** 关态内嵌文案。 */
  unCheckedChildren?: ReactNode;
  /** 校验规则（原样透传；布尔字段的必填需调用方显式声明）。 */
  rules?: FormItemProps['rules'];
  /** 辅助/错误文案。 */
  help?: ReactNode;
}

export function SwitchField(props: SwitchFieldProps) {
  const { name, label, disabled, checkedChildren, unCheckedChildren, rules, help } = props;

  return (
    <Form.Item name={name} label={label} valuePropName="checked" help={help} rules={rules}>
      <Switch
        disabled={disabled}
        checkedChildren={checkedChildren}
        unCheckedChildren={unCheckedChildren}
        data-testid={`switch-field-${name}`}
      />
    </Form.Item>
  );
}
