/**
 * AsyncBoundary —— 异步数据的「四态统一门」。
 *
 * 用途：无论数据来自何处，容器只负责把 `loading` / `error` / `empty` 三个信号喂进来，
 * 组件按固定优先级渲染唯一一种表现，避免各页面各写一套 if-else 导致态与态互相打架。
 *
 * 优先级（互斥，从高到低）：`loading` > `error` > `empty` > `children`。
 * 插槽：`error` / `emptyText` / `retryText` 均可传任意 ReactNode，文案由容器覆盖。
 * 边界：无 `onRetry` 时错误态不渲染重试按钮；四态全空且 `children` 为空时渲染空壳而非报错。
 * 纯展示、受控、无副作用、不发请求。
 */
import { Button, Empty, Flex, Result, Skeleton } from 'antd';
import type { ReactNode } from 'react';

export interface AsyncBoundaryProps {
  /** 加载中：最高优先级，压过 error/empty。 */
  loading?: boolean;
  /** 错误内容：非空即进入错误态。 */
  error?: ReactNode;
  /** 空态开关：true 即进入空态。 */
  empty?: boolean;
  /** 空态文案，缺省「暂无数据」。 */
  emptyText?: ReactNode;
  /** 骨架屏段落行数，缺省 3。 */
  skeletonRows?: number;
  /** 错误态「重试」回调；不传则不渲染重试按钮。 */
  onRetry?: () => void;
  /** 重试按钮文案，缺省「重试」。 */
  retryText?: ReactNode;
  /** 正常态内容。 */
  children: ReactNode;
}

/** 判断一个 ReactNode 是否为「有内容」（0 / '' 视为有内容，undefined/null/false 视为空）。 */
function isPresent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== '';
}

export function AsyncBoundary(props: AsyncBoundaryProps) {
  const { loading, error, empty, emptyText, skeletonRows = 3, onRetry, retryText, children } = props;

  let content: ReactNode;
  if (loading) {
    // Skeleton 不透传 data-* ，外层用 Flex 承载测试锚点（仍是 antd 布局原语）。
    content = (
      <Flex vertical data-testid="async-boundary-loading">
        <Skeleton active paragraph={{ rows: skeletonRows }} />
      </Flex>
    );
  } else if (isPresent(error)) {
    content = (
      <Result
        status="error"
        subTitle={error}
        data-testid="async-boundary-error"
        extra={
          onRetry ? (
            <Button type="primary" onClick={onRetry} data-testid="async-boundary-retry">
              {retryText ?? '重试'}
            </Button>
          ) : undefined
        }
      />
    );
  } else if (empty) {
    content = <Empty description={emptyText ?? '暂无数据'} data-testid="async-boundary-empty" />;
  } else {
    content = children;
  }

  return (
    <Flex vertical data-testid="async-boundary-root">
      {content}
    </Flex>
  );
}
