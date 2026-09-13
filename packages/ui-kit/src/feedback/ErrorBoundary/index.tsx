/**
 * `ErrorBoundary` —— 渲染期异常的**兜底容器**（零业务、零 store，唯一一个类组件）。
 *
 * 为什么必须有：React 18 里 render / 生命周期抛出的未捕获异常会让 React **卸载整棵树**，
 * 屏幕只剩一片白，且用户拿不到任何错误文字（本仓 2026-09-14 用户实测「点前往 → 白屏」即此形态）。
 * 包一层 boundary 后，白屏变成一张可读、可复制的 `Alert` 卡片 —— 它**不是修复**，
 * 而是把「不可诊断」变成「可诊断」。
 *
 * 约定：
 * - 只依赖 `antd` + `react`，不 import 任何业务包；
 * - 颜色只用 antd token / 预设语义（`Alert type="error"`），禁内联 hex；
 * - `onError` 是**唯一的对外出口**（打点 / 上报 / `console.error`），本组件不自己上报；
 * - 错误态不回显任意 `error.stack`（React 的组件栈才是有用信息，且经 `getDerivedStateFromError`
 *   拿到的是 Error 实例本身）。
 *
 * 边界：
 * - 子节点正常 → 原样渲染 `children`，**不额外产生任何 DOM 包裹**（不破坏父级布局与查询）；
 * - `onError` 未传 → 静默（React 自己仍会打印一次）；
 * - `componentStack` 为空（非 React 渲染期抛错）→ 只显示 message，不渲染「组件栈」折叠块；
 * - 同类错误重复抛 → 状态幂等，不会自增或死循环。
 */
import { Alert, Flex, Typography } from 'antd';
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** 卡片标题；缺省「此区域渲染出错」。 */
  title?: ReactNode;
  /** 出错回调（打点 / 上报 / 追加 `console.error`）。 */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** 错误详情下方是否展示组件栈（缺省展示，便于用户整段复制回来）。 */
  showStack?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** React 的组件栈（`ErrorInfo.componentStack`），与 `error.stack` 不是一回事。 */
  componentStack: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, componentStack: null };

  /** render 期抛错 → React 用返回值合并进 state（必须与 `error` 同名）。 */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 组件栈只在提交阶段拿得到（getDerivedStateFromError 是纯函数，拿不到 ErrorInfo）
    this.setState({ componentStack: info.componentStack ?? null });
    this.props.onError?.(error, info);
  }

  override render(): ReactNode {
    const { children, title = '此区域渲染出错', showStack = true } = this.props;
    const { error, componentStack } = this.state;
    if (error === null) return children;

    return (
      <Alert
        type="error"
        showIcon
        data-testid="error-boundary-alert"
        title={<span data-testid="error-boundary-title">{title}</span>}
        description={
          <Flex vertical gap={8}>
            <Typography.Text
              data-testid="error-boundary-message"
              copyable={{ text: `${error.name}: ${error.message}` }}
            >
              {error.name}: {error.message}
            </Typography.Text>
            {showStack && componentStack !== null ? (
              <details data-testid="error-boundary-details">
                <summary>组件栈</summary>
                <Typography.Paragraph
                  data-testid="error-boundary-stack"
                  copyable={{ text: componentStack }}
                  style={{ whiteSpace: 'pre-wrap', marginBottom: 0, fontFamily: 'monospace' }}
                >
                  {componentStack}
                </Typography.Paragraph>
              </details>
            ) : null}
          </Flex>
        }
      />
    );
  }
}
