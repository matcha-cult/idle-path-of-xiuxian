/**
 * `ErrorBoundary`：正常渲染不加包裹；子组件抛错 → 渲染可读错误卡（而不是白屏）并回调 `onError`。
 *
 * React 18 在捕获到边界时仍会往 `console.error` 打一遍；测试里静音，避免污染输出。
 */
import { createRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorInfo } from 'react';
import { ErrorBoundary } from './index.js';

/** 一定抛错的子组件（渲染期，boundary 能捕）。 */
function Boom(): never {
  throw new Error('炸了');
}

function info(componentStack: string | null): ErrorInfo {
  return { componentStack } as unknown as ErrorInfo;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

describe('ErrorBoundary · 正常态', () => {
  it('无异常时原样渲染 children，不产生额外包裹、不回调', () => {
    const onError = vi.fn();
    const { container } = render(
      <ErrorBoundary onError={onError}>
        <span data-testid="child">子节点</span>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toHaveTextContent('子节点');
    // 不加 DOM 包裹：容器里就是那一个 span
    expect(container.firstElementChild).toBe(screen.getByTestId('child'));
    expect(screen.queryByTestId('error-boundary-alert')).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('ErrorBoundary · 错误态', () => {
  it('子组件渲染抛错 → 渲染错误卡片（不是白屏）并回调 onError 带组件栈', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Boom />
      </ErrorBoundary>,
    );
    const alert = screen.getByTestId('error-boundary-alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary-title')).toHaveTextContent('此区域渲染出错');
    expect(screen.getByTestId('error-boundary-message')).toHaveTextContent('Error: 炸了');
    // 组件栈可折叠展示（用户能整段复制回来）
    expect(screen.getByTestId('error-boundary-details')).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary-stack').textContent).toContain('Boom');
    expect(onError).toHaveBeenCalledTimes(1);
    const [error, errorInfo] = onError.mock.calls[0] as [Error, ErrorInfo];
    expect(error.message).toBe('炸了');
    expect(errorInfo.componentStack).toContain('Boom');
  });

  it('自定义标题生效', () => {
    render(
      <ErrorBoundary title="「地图」渲染出错">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-title')).toHaveTextContent('「地图」渲染出错');
  });

  it('showStack=false 不渲染组件栈', () => {
    render(
      <ErrorBoundary showStack={false}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-alert')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-details')).toBeNull();
  });

  it('未传 onError 也能兜底（静默，不自己抛）', () => {
    expect(() =>
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByTestId('error-boundary-alert')).toBeInTheDocument();
  });

  it('组件栈为空（非 React 渲染期抛错）时不渲染折叠块', () => {
    const ref = createRef<ErrorBoundary>();
    render(
      <ErrorBoundary ref={ref}>
        <span data-testid="child">子节点</span>
      </ErrorBoundary>,
    );
    act(() => {
      ref.current?.componentDidCatch(new Error('非渲染期'), info(null));
      ref.current?.setState({ error: new Error('非渲染期'), componentStack: null });
    });
    expect(screen.getByTestId('error-boundary-message')).toHaveTextContent('非渲染期');
    expect(screen.queryByTestId('error-boundary-details')).toBeNull();
  });
});
