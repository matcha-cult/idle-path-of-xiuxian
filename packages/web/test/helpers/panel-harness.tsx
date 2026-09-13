/**
 * 面板/组件测试夹具（**全仓唯一实现**，禁止各测试各写一份）。
 *
 * 提供：
 * - 真实 `RootStore`（假 socket 适配器 + 假 fetch，不触网）；
 * - `requests`：所有经 WS 发出的请求记录，用于断言「点击 → 真的调了 Action」；
 * - `seed()`：在 `runInAction` 里预置 store 状态（MobX 6 默认 `enforceActions: 'observed'`，
 *   渲染中观察的 observable 必须在 action 内写入，否则告警）；
 * - `render()`：自动包 `RootStoreProvider` + `ThemeRoot`（antd 上下文齐备）。
 */
import { render as rtlRender, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { runInAction } from 'mobx';
import {
  FakeSocketAdapter,
  MemoryIonetServer,
  businessFail,
  type MockHandler,
  type MockRequest,
} from '@idle-path/ionet-transport/testing';
import type { FetchLike } from '@idle-path/ionet-transport';
import { RootStoreProvider } from '../../src/app/root-context.js';
import { RootStore } from '../../src/app/root-store.js';
import { createMemoryStorage, type StorageLike } from '../../src/services/storage.js';
import { ThemeRoot } from '../../src/theme/theme-root.js';

export interface PanelHarness {
  root: RootStore;
  /** 本夹具创建过的全部适配器（重连会新增）。 */
  adapters: FakeSocketAdapter[];
  /** 经 WS 发出的请求记录。 */
  requests: MockRequest[];
  /** 预置 store 状态（在 action 内写入）。 */
  seed(mutate: () => void): void;
  /**
   * 建立 WS 连接（假适配器）。**需要断言「点击 → 发请求」的用例必须先 await 它**，
   * 否则 IonetClient 会停在「等待连接就绪」而请求永不发出。
   */
  connect(): Promise<void>;
  /** 渲染 UI（已包 RootStoreProvider + ThemeRoot）。 */
  render(ui: ReactElement): RenderResult;
}

export interface PanelHarnessOptions {
  /**
   * 自定义 WS 应答。缺省返回**业务失败**（`CHARACTER_NOT_FOUND`）：
   * - 未显式提供 handler 的展示类用例不会触发请求，因此不受影响；
   * - 交互类用例若只是想断言「请求发出去了」，默认失败也让 store 走 `error` 分支而不崩；
   * - 需要断言成功路径时显式传 handler。
   */
  handler?: MockHandler;
  /** 自定义 REST；缺省返回通用成功信封。 */
  fetchImpl?: FetchLike;
  storage?: StorageLike;
}

const OK_JSON = JSON.stringify({ success: true, message: 'ok', data: {} });

const defaultFetch: FetchLike = async () =>
  ({ ok: true, status: 200, text: async () => OK_JSON }) as Response;

export function createPanelHarness(options: PanelHarnessOptions = {}): PanelHarness {
  const adapters: FakeSocketAdapter[] = [];
  const requests: MockRequest[] = [];
  const userHandler = options.handler;

  const adapterFactory = (): FakeSocketAdapter => {
    const adapter = new FakeSocketAdapter();
    const server = new MemoryIonetServer(adapter, {
      handler: (request) => {
        requests.push(request);
        return userHandler === undefined
          ? { data: businessFail('CHARACTER_NOT_FOUND', '尚未创建角色') }
          : userHandler(request);
      },
    });
    server.start();
    adapters.push(adapter);
    return adapter;
  };

  const root = new RootStore({
    wsUrl: 'ws://test/ws',
    apiBaseUrl: '/api',
    fetchImpl: options.fetchImpl ?? defaultFetch,
    storage: options.storage ?? createMemoryStorage(),
    adapterFactory,
    heartbeat: false,
    reconnect: { enabled: false },
    autoRefreshMetricsMs: 0,
  });

  return {
    root,
    adapters,
    requests,
    seed: (mutate) => {
      runInAction(mutate);
    },
    connect: async () => {
      if (!root.connection.isOnline) await root.connection.connect();
    },
    render: (ui: ReactElement) => {
      const Wrapper = ({ children }: { children: ReactNode }) => (
        <RootStoreProvider value={root}>
          <ThemeRoot>{children}</ThemeRoot>
        </RootStoreProvider>
      );
      return rtlRender(ui, { wrapper: Wrapper });
    },
  };
}
