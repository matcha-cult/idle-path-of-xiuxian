/**
 * SubmitButton —— 表单提交按钮的统一形态。
 *
 * 用途：统一 `type="primary"`、默认文案「提交」与提交中禁用，避免每个表单各写一遍。
 * 插槽：`children` 覆盖默认文案。
 * 边界：`loading` 时会同时落下原生 `disabled`（antd 的 loading 只拦截点击、不置 disabled 属性，
 * 这里显式合并以保证键盘/读屏与自动化断言都能识别为不可提交）。
 * 不要在已经 `disabled` 的 Form 里硬传 `disabled={false}`：未传时保持 undefined，
 * 以便继承 antd `Form disabled` / `ConfigProvider` 的 DisabledContext。
 * 受控、无副作用、不发请求。
 */
import { Button } from 'antd';
import type { ReactNode } from 'react';

export interface SubmitButtonProps {
  /** 按钮文案，缺省「提交」。 */
  children?: ReactNode;
  /** 提交中：显示 loading 且不可点击。 */
  loading?: boolean;
  /** 禁用。 */
  disabled?: boolean;
  /**
   * 原生按钮类型，**缺省 `submit`**（组件名即语义：它就是表单提交按钮；
   * 缺省 `button` 会让「放进 `Form` 却按不动」成为静默陷阱）。
   * 非表单场景请显式传 `'button'`。
   */
  htmlType?: 'submit' | 'button' | 'reset';
  /** 撑满一行。 */
  block?: boolean;
  /** 危险语义。 */
  danger?: boolean;
  /** 点击回调（非表单提交场景）。 */
  onClick?: () => void;
}

export function SubmitButton(props: SubmitButtonProps) {
  const { children, loading, disabled, htmlType = 'submit', block, danger, onClick } = props;
  // false || false || undefined -> undefined：保留 DisabledContext 的继承能力。
  const mergedDisabled = disabled || loading ? true : undefined;

  return (
    <Button
      type="primary"
      htmlType={htmlType}
      loading={loading}
      disabled={mergedDisabled}
      block={block}
      danger={danger}
      onClick={onClick}
      data-testid="submit-button"
    >
      {children ?? '提交'}
    </Button>
  );
}
