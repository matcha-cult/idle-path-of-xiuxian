import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * 同源代理：REST /api → 后端，WS /ws → 后端（免 CORS）。
 * 目标端口按 VITE_BACKEND_ORIGIN 覆盖，默认 3000（06 §4.1）。
 */
const target = process.env.VITE_BACKEND_ORIGIN ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // 直接消费 TypeScript 源码，避免必须先 build 各 workspace 包
      {
        find: '@idle-path/ionet-transport/testing',
        replacement: path.resolve(here, '../ionet-transport/src/testing/index.ts'),
      },
      {
        find: '@idle-path/ionet-transport',
        replacement: path.resolve(here, '../ionet-transport/src/index.ts'),
      },
      {
        find: '@idle-path/ui-kit',
        replacement: path.resolve(here, '../ui-kit/src/index.ts'),
      },
    ],
    // antd / react 必须单实例（ui-kit 与 web 都声明了它们）：否则会出现两份 antd，
    // React context 不互通 → 主题/语言不生效。
    // 只列出 web 自己声明了依赖的包；像 @ant-design/cssinjs 这类 antd 的传递依赖由 pnpm
    // 保证单副本，若在此 dedupe 反而会因 web 侧解析不到而构建失败。
    dedupe: ['react', 'react-dom', 'antd', '@ant-design/icons'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/ws': { target, ws: true, changeOrigin: true },
    },
  },
  test: {
    // 默认 jsdom（组件测试）；Store/协议测试在文件头用 `// @vitest-environment node` 覆盖
    environment: 'jsdom',
    setupFiles: ['./test/setup-ui.ts'],
    // 组件/面板测试与被测文件同目录（src/**），跨包/夹具测试放 test/**
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    css: false,
    // antd + jsdom 渲染成本高（Table/CSS-in-JS），并发跑时默认 5s 会偶发超时
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
} as never);
