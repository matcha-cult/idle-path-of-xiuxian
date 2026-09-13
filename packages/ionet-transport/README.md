# @idle-path/ionet-transport

前端传输层 / typed API 层（`packages/web` 的唯一后端接入点）。

> **协议层不在这里。** 信封类型、JSON codec、reqId 配对算法、`kind` 分流全部来自
> `@nbb-ionet/client-protocol`（A3，浏览器安全白名单包），规格源是 `vendor/ionet-ts/PROTOCOL.md`。
> 本包若自造一套信封/codec，就是第二份协议真相——见 `ai-docs/frontend-solution-exploration/06 §3`。

## 分层

```
transport/   SocketAdapter 接口 + BrowserSocketAdapter（平台差异唯一收敛点，后期 wx/qq 只加适配器）
client/      IonetClient 状态机 / Correlation 关联策略 / 错误模型 / LifecycleAdapter
api/         commands 常量 + DTO 类型 + GameApi（46 个 WS Action）+ RestApi（7 个 REST endpoint）+ 错误码文案
testing/     FakeSocketAdapter + MemoryIonetServer（零后端开发/测试）
```

## 关键契约（实施铁律，06 §7）

| # | 约束 | 落点 |
|---|---|---|
| 1 | 协议只认 `PROTOCOL.md` + `@nbb-ionet/client-protocol`，不重造协议层 | `client/ionet-client.ts` 全部委托 A3 |
| 2 | 业务失败判定必须同时看 `errorCode` **和** `data.success === false` | `client/errors.ts` `assertResponseOk` |
| 3 | 默认 **reqId 并发**，串行 (`correlation: 'serial'`) 仅作兜底 | `client/correlation.ts` |
| 4 | 浏览器鉴权走 **`?token=`**；心跳走 **`system.ping (1,1)`**（免鉴权） | `client/ionet-client.ts` `withToken` / `DEFAULT_HEARTBEAT` |
| 5 | 禁 import Node-only `@nbb-ionet/*`；A3 是白名单例外 | `package.json` dependencies 只有 A3 |

## 用法

```ts
import { IonetClient, GameApi, RestApi } from '@idle-path/ionet-transport';

const rest = new RestApi({ baseUrl: '/api' });
const { data } = await rest.auth.login(username, password);

const client = new IonetClient({
  url: `ws://${location.host}/ws`,
  authHandler: () => data?.token,          // → 握手拼 ?token=
  heartbeat: { intervalMs: 15_000, timeoutMs: 10_000 }, // system.ping (1,1)
});

await client.connect();
const game = new GameApi(client);
const [bag, realm] = await Promise.all([           // reqId 并发
  game.item.inventory({ page: 1, pageSize: 20 }),
  game.realm.breakthroughInfo(),
]);
```

## 验收

```bash
pnpm --filter @idle-path/ionet-transport run typecheck   # tsc
pnpm --filter @idle-path/ionet-transport run test        # vitest：53 例（含协议金样对齐 + 边界）
pnpm --filter @idle-path/ionet-transport run smoke:real  # 需后端在 3000 端口运行
```

- `test/protocol-goldens.test.ts` 直接消费 A3 的 `ENVELOPE_GOLDENS`，保证出站请求帧**逐字节一致**。
- `scripts/real-server-smoke.mjs` 走真实后端：REST 登录 → `?token=` 握手 → 心跳 → 并发 8 Action
  → 业务失败（`ITEM_NOT_FOUND`）→ 无 token 401 拒连。

## 尚未关闭

- **Q5 业务错误码表**：`api/business-error-codes.ts` 按 `07-后端API面清单.md §3` 镜像 51 个码，待后端出正式表。
- **Q6 `serverTime`**：`IonetClient` 已兼容 `data.serverTime` / `data.data.serverTime`，服务端未提供时为 `null`。
- **Q9 HTTP fallback**：后端 `httpServer: false`，本包未实现 HTTP 降级通道。
