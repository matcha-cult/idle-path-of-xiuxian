# idle-path-web

「放置·修仙之路」Web 前端（React 18 + Vite + MobX 6 + **antd v6**）。PC 与手机浏览器同源。

> 实施基线：`ai-docs/frontend-solution-exploration/06-现状校正与实施基线（2026-09-13）.md` §4 的 T1~T4。
> UI 规范：`ai-docs/frontend-solution-exploration/09-antd组件化与主题切换实施规划.md`（组件化 / 紧凑 / 主题）。
> 协议唯一真相：`vendor/ionet-ts/PROTOCOL.md` + `@nbb-ionet/client-protocol`（经 `@idle-path/ionet-transport` 消费）。

## 分层

```
UI（React，observer 组件，只管渲染与事件）
  └── @idle-path/ui-kit（通用组件，antd，零业务零 store）
        └── Store 树（MobX makeAutoObservable；ThemeStore / ConnectionStore / SessionStore / ToastStore + 11 个游戏域 Store）
              └── services/（GameClient 装配 transport + RestApi + GameApi + 推送总线 NotificationBus）
                    └── @idle-path/ionet-transport（transport + 状态机 + typed API）
                          └── @nbb-ionet/client-protocol（信封 / codec / reqId 配对 / kind 分流）
```

依赖单向：UI → ui-kit → …；**Store 不 import React**；**ui-kit 不 import 任何业务包**。

## 主题与紧凑布局

| 项 | 实现 | 约束 |
|---|---|---|
| 主题态 | `src/theme/theme-store.ts`：**只有 light/dark 两态**，`localStorage` 持久化（键 `idle-path.theme`） | 不做 `system` 第三态 |
| 紧凑 | ui-kit `buildThemeConfig` 恒含 `theme.compactAlgorithm` | **无开关**；组件不得再设 `size` |
| 一键切换 | ui-kit `ThemeFloatButton`（容器 `src/components/AppThemeToggle.tsx`） | 单按钮亮↔暗 |
| 防闪烁 | `index.html` 首帧内联脚本写 `data-theme` / `color-scheme`；`TokenCssVarBridge` 用 `useLayoutEffect` 在首帧绘制前写入 token 变量 | `data-theme` **不是样式来源** |
| 颜色来源 | 唯一通道 `src/theme/token-css-vars.ts`：antd token → `--app-*` CSS 变量 | `styles.css` 禁止硬编码色值 |

> 首帧背景由 `color-scheme` 驱动浏览器默认画布，页面底色由 `.app-root`（antd `App` 容器）承载
> `--app-bg`，因此 CSS 里**不需要**再维护一份明暗配色（避免双主题真相）。

## 页面与面板结构（M3）

```
src/
├── app/            App（三态门）/ root-store / root-context
├── components/     ConnectionStatus（antd Badge）/ ToastBridge（App.useApp 的 message）/ AppThemeToggle
├── pages/
│   ├── LoginPage.tsx            登录 / 注册（antd Form + ui-kit 字段）
│   ├── CharacterCreatePage.tsx  建角
│   └── game/
│       ├── GameShellPage.tsx    壳：PageShell + PanelTabs（只装配，77 行）
│       ├── panel-registry.tsx   ★ 可插拔注册表：新增游戏域只改这里
│       └── panels/              11 个域面板（每个 ≤150 行 + 同目录测试）
├── stores/         11 个域 Store + Theme/Session/Connection/Toast + load-guard（竞态守卫）
├── services/       GameClient / NotificationBus / storage（唯一存储抽象）
└── theme/          ThemeStore / ThemeRoot / token-css-vars / document-theme
```

**面板铁律**（新增面板照抄 `panels/BagPanel.tsx`）：
1. 只做「store 状态 → ui-kit props」映射，不写业务规则/公式/数值文案；
2. **不在挂载时拉取**——首屏由 `RootStore.loadPanel()` 并发加载；
3. 三态（loading/error/empty）一律交给 `AsyncBoundary`；
4. 视觉原语只用 ui-kit + antd：不写裸 `div` 布局、不写内联色值、不传 `size`（紧凑全局生效）；
5. 破坏性操作一律 `ConfirmAction` 两步确认。

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
- 反馈 API 一律 `App.useApp()`（禁 antd 静态 `message.*` / `Modal.confirm`，否则主题/locale 失效）。
- 只读大数组用 `observable.shallow`；加载类 action 用 `stores/load-guard.ts` 拦截**过期响应回写**
  （先发后到不得覆盖新数据）。
- 源码门禁：`test/hygiene.test.ts`（内联 hex / `!important` / `<style>` / 静态反馈 API / 单文件规模，棘轮式）。

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
pnpm --filter idle-path-web run test        # vitest：Store/组件/面板/门禁（jsdom + 假适配器）
pnpm --filter idle-path-web run test -- test/stores/load-guard-race.test.ts   # 单跑竞态守卫
pnpm --filter idle-path-web run build       # vite build（含 tsc）
IONET_E2E=1 pnpm --filter idle-path-web run test   # 追加真实后端 e2e（需后端在 3000）
```
