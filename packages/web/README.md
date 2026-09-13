# idle-path-web

「放置·修仙之路」Web 前端（React 18 + Vite + MobX 6 + TypeScript）。PC 与手机浏览器同源。

> 实施基线：`ai-docs/frontend-solution-exploration/06-现状校正与实施基线（2026-09-13）.md` §4 的 T1~T4。
> 协议唯一真相：`vendor/ionet-ts/PROTOCOL.md` + `@nbb-ionet/client-protocol`（经 `@idle-path/ionet-transport` 消费）。

## 分层

```
UI（React，observer 组件，只管渲染与事件）
  └── Store 树（MobX makeAutoObservable；ConnectionStore / SessionStore / ToastStore + 11 个游戏域 Store）
        └── services/（GameClient 装配 transport + RestApi + GameApi + 推送总线 NotificationBus）
              └── @idle-path/ionet-transport（transport + 状态机 + typed API）
                    └── @nbb-ionet/client-protocol（信封 / codec / reqId 配对 / kind 分流）
```

依赖单向：UI → Store → services → transport → client-protocol。**Store 不 import React**。

## 通道职责（后端已定死，06 §1 S2）

| 通道 | 范围 |
|---|---|
| REST `/api` | `auth`（注册/登录）、`character`（建号/查询）、`health` |
| WS `/ws` | 其余全部游戏交互：12 段 / 46 个 Action（cmd 1/30/40/50/60/70/80/90/100/110/120/130） |

## 关键约束

- 浏览器鉴权：`?token=<jwt>`（浏览器 `WebSocket` 不能设握手头，PROTOCOL.md §6）。
- 应用层心跳：`system.ping (1,1)`，15s 一发 / 10s 未收判死（PROTOCOL.md §7，免鉴权）。
- 默认 reqId 并发：面板各域 `Promise.all` 并发加载，慢 Action 不阻塞。
- 错误分层：传输层 `errorCode`（400/404/500）与业务层 `data.success === false` **都要判**（06 §2）；
  `ToastStore.fromError` 是唯一出口。
- 禁 import Node-only 的 `@nbb-ionet/*`；`client-protocol`（经 transport 间接）是白名单例外。

## 开发

```bash
# 后端（另开终端，需宿主 DB/Redis）
pnpm --filter idle-path-server run build && node packages/server/dist/main.js

# 前端 dev（Vite 代理 /api 与 /ws 到 127.0.0.1:3000，免 CORS）
pnpm --filter idle-path-web run dev      # http://127.0.0.1:5173
```

环境变量（可选）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `VITE_BACKEND_ORIGIN` | `http://127.0.0.1:3000` | Vite 代理目标（仅 dev） |
| `VITE_WS_URL` | 同源 `/ws` | 覆盖 WS 端点 |
| `VITE_API_BASE_URL` | `/api` | 覆盖 REST 前缀 |

## 验收

```bash
pnpm --filter idle-path-web run typecheck   # tsc --noEmit
pnpm --filter idle-path-web run test        # vitest（Store 边界 + 假适配器）
pnpm --filter idle-path-web run build       # vite build（含 tsc）
IONET_E2E=1 pnpm --filter idle-path-web run test   # 追加真实后端 e2e（需后端在 3000）
```
