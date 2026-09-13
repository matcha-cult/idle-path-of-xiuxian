/**
 * ThemeFloatButton —— 同一「亮/暗切换」语义的悬浮入口（纯展示，受控）。
 *
 * 与 `ThemeToggle` 是同一语义的两种呈现（可插拔）：不合并成一个 `variant` 联合 prop，
 * 以免组件承担两种布局职责。由使用方按场景挑一个。
 */
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { FloatButton } from 'antd';
import { themeToggleLabel, type ThemeMode } from '../types.js';

export interface ThemeFloatButtonProps {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  /** 悬浮位置（默认右下角）。 */
  right?: number;
  bottom?: number;
  label?: string;
}

export function ThemeFloatButton(props: ThemeFloatButtonProps) {
  const { value, onChange, right = 24, bottom = 24, label } = props;
  const title = label ?? themeToggleLabel(value);
  const dark = value === 'dark';
  return (
    <FloatButton
      icon={dark ? <SunOutlined /> : <MoonOutlined />}
      tooltip={title}
      aria-label={title}
      data-testid="theme-float-button"
      style={{ right, bottom }}
      onClick={() => onChange(dark ? 'light' : 'dark')}
    />
  );
}
