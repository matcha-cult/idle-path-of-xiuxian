/**
 * ThemeToggle —— 一键亮/暗切换（纯展示，受控）。
 *
 * 无 store 依赖：`value` + `onChange` 由容器注入，故可独立渲染与单测。
 * 图标-only 按钮必须有可读名称（`aria-label`），保证键盘与读屏可用。
 */
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { themeToggleLabel, type ThemeMode } from '../types.js';

export interface ThemeToggleProps {
  /** 当前主题态。 */
  value: ThemeMode;
  /** 点击后回调「相反态」。 */
  onChange: (mode: ThemeMode) => void;
  disabled?: boolean;
  /** 自定义提示文案（覆盖默认）。 */
  label?: string;
}

export function ThemeToggle(props: ThemeToggleProps) {
  const { value, onChange, disabled, label } = props;
  const title = label ?? themeToggleLabel(value);
  const dark = value === 'dark';
  return (
    <Tooltip title={title}>
      <Button
        type="text"
        shape="circle"
        disabled={disabled}
        aria-label={title}
        data-testid="theme-toggle"
        icon={dark ? <SunOutlined /> : <MoonOutlined />}
        onClick={() => onChange(dark ? 'light' : 'dark')}
      />
    </Tooltip>
  );
}
