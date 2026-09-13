import { availableParallelism } from 'node:os';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// vitest 1.6 的 worker 数有两个坑，只设 maxWorkers 一定跑不起来（实测）：
//   1. `maxWorkers` 只接受数字：百分比字符串是 2.x 语法，`Number('50%')` → NaN，
//      传到 tinypool 变成 `new Array(NaN)` → `RangeError: Invalid array length`；
//   2. `minWorkers` 未显式给出时默认取 `numCpus - 1`，于是任何小于它的 maxWorkers
//      都会撞上 `options.minThreads and options.maxThreads must not conflict`。
// 因此这里两个一起钉死为「一半核数」，对核数不同的机器自适应。
const maxWorkers = Math.max(1, Math.floor(availableParallelism() / 2));
const minWorkers = maxWorkers;

/** 组件测试：jsdom + React 插件（antd v6 CSS-in-JS 无需额外 CSS 处理）。 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    css: false,
    // antd + jsdom 的渲染成本较高（CSS-in-JS 注入 + rc-* 测量）；最重的表单用例单文件实测可达 45s。
    // 放宽到 60s 保 CI 稳定（性能债已登记 local-pending-work 1.11）。
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // 每台 worker 都是完整 jsdom + antd CSS-in-JS，默认按 CPU 数拉满会互相挤到超时（实测偶发）
    maxWorkers,
    minWorkers,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      // testing/ 是测试基础设施（不参与产品覆盖率），与 test/ 同性质
      exclude: ['src/index.ts', 'src/testing/**', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
      // 规划 09 §3 T-D：每个导出组件/纯函数都必须有测试；阈值 90%
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
});
