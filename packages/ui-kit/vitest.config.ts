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
    // antd + jsdom 的渲染成本较高（CSS-in-JS 注入 + rc-* 测量）；最重的表单用例单文件实测可达 45s。
    // 放宽到 60s 保 CI 稳定（性能债已登记 local-pending-work 1.11）。
    testTimeout: 60_000,
    hookTimeout: 60_000,
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
