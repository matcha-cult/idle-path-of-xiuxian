# 任务 3 · headers/traceId 透传 + 可选握手鉴权

> 归口：`../protocol.md`；沟通记录：`../session-collaboration.md`（只增不删）。

## 1. 现状（消费方实测证据）

- `packages/external-server/src/websocket/ws-server.ts` 的 `handleMessage` 只取 `{ cmd, subCmd, data }`，**丢弃 `headers`/`traceId`**。
- `packages/core-framework/src/core/flow/flow-context.ts` 的 `Request` 已定义 `headers?`/`traceId?`，但没人填。
- **无握手鉴权**：消费方只能把 JWT 塞进 `data.__token`，由自定义 `WsAuthInOut` 取出并 `bindingUserId`
  （消费方 `packages/server/src/ionet/ws-auth.inout.ts`）。

## 2. 要求

- **透传**：`ws-server` 把报文 `headers`/`traceId` 填入 `skeleton.execute` 的 request，使 `ctx.getRequest()?.headers` / `traceId` 可读。
- **握手鉴权（可选、默认关闭，保证兼容）**：
  - `WebSocketExternalServerOptions` 增加如
    `authenticate?: (input: { headers; url; protocol? }) => Promise<{ userId: bigint } | null>`；
  - 在 `upgrade`/`connection` 阶段调用；失败则**拒绝升级**（HTTP 401）或立即 `close` 并输出可诊断日志；
  - 成功则把 userId 绑定到连接（与任务 1 注册表打通），该连接上每次 `execute` 的 `FlowContext` 天然带该 userId；
  - **未配置 `authenticate` 时行为与现在完全一致**。
- 消费方验收目标：`WsAuthInOut` 可删除或降级为兜底，改在握手阶段校验 JWT。

## 3. 测试

- [ ] 请求带 `headers`/`traceId` → Action 内 `ctx.getRequest()?.headers` 可读
- [ ] `authenticate` 返回 null → 连接被拒（401/立即关闭）
- [ ] `authenticate` 成功 → Action 内 `ctx.getUserId()` 非 0
- [ ] 未配置 `authenticate` → 旧行为不变

## 4. 消费方升级后的验收（A 侧执行）

- 鉴权迁到握手（`main.ts`/`app.module.ts` 传 `authenticate`），`WsAuthInOut` 简化或删除，回归全部 e2e
