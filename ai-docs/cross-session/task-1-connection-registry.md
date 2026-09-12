# 任务 1 · 连接注册表与定向推送

> 归口：`../protocol.md`；沟通记录：`../session-collaboration.md`（只增不删）。
> 目标仓库：`<framework-workspace>`。

## 1. 现状（消费方实测证据）

- `packages/external-server/src/websocket/ws-server.ts`：`ClientConnection { ws; isAlive; userId?: bigint }`；
  `sendTo(userId, message)` 遍历 clients 比较 `connection.userId === userId`，但**全仓库没有任何地方给 `connection.userId` 赋值** → `sendTo` 恒返回 `false`。
- `packages/core-framework/src/core/flow/flow-context.ts`：`bindingUserId(userId)` 只写 `FlowContext`（与 session）。
- `packages/core-framework/src/core/bar-skeleton.ts:51`：`execute()` 内部 `new FlowContext()` 并把 ctx 关在闭包内，**外部拿不到本次执行的 userId**。
- `packages/core-framework/src/broadcast/*`：broadcaster/connectionRegistry 已有实现，但 external-server 未接线。

## 2. 要求

- 提供一条**不破坏现有 API** 的 userId 可见通道，任选其一并在提交信息说明取舍：
  (a) `execute(request, hooks?)` 增加可选 `hooks.onFlowContext?(ctx)` / `onBound?(userId)`；
  (b) 新增 `executeWithContext()` 返回 `{ response, userId }`；
  (c) 外部服注册内部 InOut，在 `fuckOut` 回调外部服。
- `ws-server` 在 `handleMessage` 中把 `ctx.getUserId()`（`!== 0n` 时）绑定到对应连接；`userId === 0n` **不得绑定**。
- 连接 `close`/`error` 时清理注册项。
- `sendTo`：命中已绑定且 `readyState === OPEN` → 发送并返回 `true`；无命中 → `false`（不抛错）。
- **同一 userId 多连接**策略需明确写死并测试锁定（建议：全部发送、返回是否至少命中一个）。
- 已有 `broadcast`/`connectionRegistry` 抽象优先复用。

## 3. 测试（`packages/external-server/src/websocket-server.test.ts` 或新增 `src/websocket/*.test.ts`）

- [ ] 绑定后 `sendTo` 命中 → true；未绑定 → false
- [ ] `userId = 0n` 不被绑定
- [ ] 连接关闭后不再命中（注册表已清理）
- [ ] 同一 userId 多连接行为与所选策略一致
- [ ] 不影响既有 `broadcast` 行为

## 4. 消费方升级后的验收（A 侧执行）

- 定向推送成功/未命中两态脚本验证
- `sendTo` 接入对外服（消费方 `packages/server/src/modules/edge/edge.service.ts`）后，可用于通知/推送
