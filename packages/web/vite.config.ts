import path from 'node:path';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

// vitest 1.6 的 worker 数有两个坑，只设 maxWorkers 一定跑不起来（实测）：
//   1. `maxWorkers` 只接受数字：'50%' 是 2.x 语法，`Number('50%')` → NaN，
//      tinypool 里变成 `new Array(NaN)` → `RangeError: Invalid array length`；
//   2. `minWorkers` 未显式给出时默认取 `numCpus - 1`，任何更小的 maxWorkers 都会撞上
//      `options.minThreads and options.maxThreads must not conflict`。
// 两个一起钉死为「一半核数」，对核数不同的机器自适应。
const maxWorkers = Math.max(1, Math.floor(availableParallelism() / 2));
const minWorkers = maxWorkers;

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
        // 子路径必须先于主入口匹配（字符串 alias 是前缀替换，顺序反了就拼错路径）
        find: '@idle-path/ui-kit/testing',
        replacement: path.resolve(here, '../ui-kit/src/testing/index.ts'),
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
    // antd + jsdom 渲染成本高：最重的面板用例（两张 antd Table）单文件实测 33~45s，
    // 20s 在并发负载下会偶发超时。放宽到 60s 保 CI 稳定（性能债已登记 local-pending-work 1.11）
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // 同上：限制 worker 数，避免多个重型面板用例互相挤到超时
    maxWorkers,
    minWorkers,
  },
} as never);
