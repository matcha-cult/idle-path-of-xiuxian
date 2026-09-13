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
  },
});
