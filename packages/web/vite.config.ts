import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
      // 直接消费 TypeScript 源码，避免必须先 build transport 包
      {
        find: '@idle-path/ionet-transport/testing',
        replacement: path.resolve(here, '../ionet-transport/src/testing/index.ts'),
      },
      {
        find: '@idle-path/ionet-transport',
        replacement: path.resolve(here, '../ionet-transport/src/index.ts'),
      },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/ws': { target, ws: true, changeOrigin: true },
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
} as never);
