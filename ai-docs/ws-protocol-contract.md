# WS 接口契约（v1 · 定稿）

> 对应 `ai-docs/http-ws-logic-server-refactor-plan.md` 的 M0「输出 WS 接口契约」。
> 归属：ionet 外部服（对外服）统一接入；逻辑服只提供 Action 路由。

## 1. 传输

| 项 | 取值 |
|---|---|
| 协议 | WebSocket（JSON 文本帧） |
| 地址 | `ws://<host>:<PORT>/ws` |
| 端口 | 与 HTTP **同端口**（attach 到 NestJS `http.Server` 的 upgrade） |
| 编解码 | 默认 JSON；字段名与 ionet 信封一致 |
| 心跳 | 服务端每 30s `ws.ping()`；客户端必须回 `pong`，否则连接被 terminate |

HTTP 基础能力（`/api/auth/*`、`/api/character/*`、`/api/health`）与 WS 分离：**同一进程、同一端口、不同路径**。

## 2. 请求信封

```jsonc
{
  "cmd": 30,              // 必填：逻辑服段号
  "subCmd": 1,            // 必填：段内路由号
  "data": {               // 可选：业务参数（对象；鉴权令牌默认也在此）
    "__token": "<jwt>"    // 受保护 Action 必填（启用握手鉴权后无需再传）
  },
  "reqId": "c1-ab12cd"    // 可选：请求配对 id；服务端原样回显
}
```

## 3. 响应信封（由 ionet `BarSkeleton.execute` 产出）

```jsonc
{
  "data": { ... },        // 成功：Action 返回值
  "errorCode": 404,       // 失败：错误码（成功时省略）
  "errorMessage": "...",  // 失败：错误信息
  "reqId": "c1-ab12cd",   // 回显请求 reqId（请求未带则不出现）
  "kind": "response"      // 'response' | 'notification'（仅新协议路径出现）
}
```

> **已支持 `reqId` 配对与 `kind` 判别**（框架 `d9a3beb`）：客户端可并发发起请求并按 `reqId` 精确配对；
> 主动推送用 `kind: 'notification'` 与响应区分。**不带 `reqId` 的旧请求，其响应逐字节不变**（既无 `reqId` 也无 `kind`）。

## 4. 鉴权（WS 握手，强制）

- **主路径**：客户端在 upgrade 阶段带 `Authorization: Bearer <jwt>`；校验通过则**整条连接**绑定 userId，
  框架在每次 execute 的 `onFlowContext` 中预置给 `FlowContext`（框架 `d8a4f71` 的 `wsServer.authenticate`）。
- **浏览器路径**：无法设置握手头的客户端用 `ws://host/ws?token=<jwt>`。
- **校验失败/缺失 → 拒绝升级（HTTP 401）**，连接根本建立不起来。
- 服务端实现见 `app.module.ts` 的 `wsServer.authenticate`，复用 `src/common/auth/jwt.ts`（与 HTTP 侧同一密钥/语义）。
- Action 侧仍用 `requireUserId(ctx)` 取 userId。
- `cmd.ts` 的 `PUBLIC_ACTION_KEYS` 保留：用于**未启用握手鉴权**的部署形态；
  启用握手鉴权后所有连接均已鉴权，原 `WsAuthInOut`（`data.__token` 兜底）已删除。

## 5. 错误码

| errorCode | 含义 | 来源 |
|---|---|---|
| 0 / 省略 | 成功 | `execute` 正常返回 |
| 400 | 报文非法（非 JSON/缺 cmd） | WS 层 `Invalid message format` |
| 404 | 路由不存在 | `execute` 未命中 region/subCmd |
| 500 | 未捕获异常 | `execute` catch 兜底 |
| — | 业务失败 | Action 统一返回 `{ success:false, message, data:{ code } }`，`errorCode` 仍为 0 |

业务错误码（`data.code`）：`INVALID_PARAM` / `UNAUTHORIZED` / `CHARACTER_NOT_FOUND` / `FORBIDDEN`（开发接口生产禁用）等。

## 6. cmd 分段（定稿，与 `src/ionet/cmd.ts` 一致）

| 段 | cmd | 逻辑服 | 层 | 允许依赖 |
|---|---|---|---|---|
| system | 1 | 系统/健康 | L-1 | — |
| auth | 10 | 认证（HTTP 占位） | L-1 | — |
| character | 20 | 角色（HTTP 占位） | L-1 | — |
| item | 30 | 物品（基底/词缀/实例化/背包存储/拾取规则） | L-1 | — |
| prop | 40 | 道具（获得/消耗/丢弃/分解） | L0 | item |
| equip | 50 | 装备（穿戴/卸下/装备栏） | L0 | item |
| skill | 60 | 功法（修习/装配/参悟） | L0 | character |
| economy | 70 | 通货/炼器 | L1 | item, prop |
| realm | 80 | 境界突破 | L1 | character, prop |
| combat | 90 | 战斗（单位/击杀/掉落/辨宝） | L1 | item, equip |
| zone | 100 | 秘境（层数/推进/解锁） | L2 | combat, item, equip |
| quest | 110 | 任务/章节 | L3 | zone, combat, item |
| story | 120 | 剧情（剧本/已读） | L3 | quest |
| idle | 130 | 挂机（离线结算） | L4 | item, equip, combat, zone |
| — | — | 对外服 Edge（广播/通知/推送） | — | 仅 NotificationPort |

段内 subCmd 明细见 `src/ionet/cmd.ts`（每域一个 `XXX_CMD` 常量对象）。

## 7. REST → WS 迁移映射（M3 逐条落地）

| 旧 REST | 新 WS (cmd, subCmd) |
|---|---|
| `GET /api/game/inventory` | (30,1) item.inventory |
| `GET /api/game/inventory/:id` | (30,2) item.inventoryDetail |
| `GET /api/game/item/bases` | (30,3) item.bases |
| `GET/POST/PUT/DELETE /api/game/pickup-rules` | (30,4~7) item.pickupRule* |
| `POST /api/game/item/discard` | (40,1) prop.discard |
| `POST /api/game/item/generate`（dev） | (40,2) prop.generate |
| `POST /api/game/item/equip\|unequip`、`GET /api/game/equipment` | (50,1~3) equip.* |
| `GET /api/game/skills`、`POST /api/game/skill/*`、`POST /api/game/lingyun/grant` | (60,1~7) skill.* |
| `GET /api/game/currencies`、`currency/grant`、`item/craft`、`essences`、`essence/grant` | (70,1~5) economy.* |
| `GET/POST /api/game/breakthrough` | (80,1~2) realm.* |
| `GET /api/game/units`、`drop-tables`、`POST unit/spawn\|kill` | (90,1~4) combat.* |
| `GET /api/game/zones`、`zone/progress\|enter\|challenge` | (100,1~4) zone.* |
| `GET /api/game/quests*`、`quest/sync`、`chapters*`、`chapter/sync` | (110,1~6) quest.* |
| `GET /api/game/story/*`、`POST story/seen` | (120,1~3) story.* |
| `GET /api/game/idle/status`、`POST idle/settle` | (130,1~2) idle.* |

## 8. 客户端接入建议（v1.1）

1. 登录拿到 JWT 后建立 `/ws` 连接（可带 `Authorization` 头走握手鉴权，见 §4）；
2. 受保护请求把令牌放进 `data.__token`（未启用握手鉴权时）；
3. **按 `reqId` 配对**：客户端为每个请求生成 `reqId`，服务端回显后精确配对；**支持并发在途请求**（不再需要串行队列）；
   - 收到 `kind === 'notification'` → 视为服务端推送，**不要**当作响应；
   - 响应未带 `reqId`（旧服务）→ 按「最早在途请求」回退配对；
4. 应用层心跳：定期发 `(1,1) system.ping`（同样走 `reqId` 配对）；
5. 收到 `errorCode` 视为通道级错误，收到 `data.success === false` 视为业务级错误。

## 9. 框架能力现状（M6 已完成，submodule = `d9a3beb`）

- ✅ **`reqId` 配对 + `kind` 判别**（框架 `6a31847`）→ 客户端可并发，推送与响应可区分；
- ✅ **headers/traceId 透传 + 可选握手鉴权**（框架 `d8a4f71`）→ 可不再把令牌放进 `data`；
- ✅ **连接注册表 + `sendTo` 定向推送**（框架 `6dae720`）→ 对外服可定向推送；
- ✅ **`ActionFactoryBeanForNest`**（框架 `d9a3beb`）→ Action 可走 NestJS DI（可去桥接模块）；
- ✅ **`NODE_ENV=production` 守卫可配置**（框架 `d57cada`，本服务接 `IONET_ALLOW_PRODUCTION`）。

> 说明：以上框架能力在 `d9a3beb` 已可用并独立复核通过（框架构建 + 测试 + 本服务回归全绿）。
> 消费侧"SDK 去串行队列（已完成）/ 鉴权迁握手 / 删除桥接模块"由本工作区按需接入。
