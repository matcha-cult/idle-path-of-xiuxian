import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** 组件测试：jsdom + React 插件（antd v6 CSS-in-JS 无需额外 CSS 处理）。 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    css: false,
    // antd + jsdom 的渲染成本较高（CSS-in-JS 注入 + rc-* 测量），默认 5s 在并发下会偶发超时。
    // 这里放宽到 20s，保证 CI 稳定性（单文件实测 1~20s）。
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/index.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
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
