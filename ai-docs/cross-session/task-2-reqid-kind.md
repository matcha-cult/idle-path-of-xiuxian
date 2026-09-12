# 任务 2 · reqId 与 kind 判别

> 归口：`../protocol.md`；沟通记录：`../session-collaboration.md`（只增不删）。

## 1. 现状（消费方实测证据）

- 请求信封 `{ cmd, subCmd, data }`；响应信封 `{ data?, errorCode?, errorMessage? }`——**无 cmd 回显、无 reqId、无 kind**（`packages/core-framework/src/protocol/message.ts`）。
- 消费方被迫使用**串行队列**保证请求-响应配对（`packages/server/scripts/sdk/ws-client.ts`：同一时刻只允许一个在途请求）。
- 广播/通知与响应**无法区分**，消费方只能"有在途请求就当作响应"。

## 2. 要求

- 请求信封新增**可选** `reqId?: string | number`；响应信封回显同名 `reqId`（请求未带则响应也不带）。
- 响应信封新增 `kind`（建议 `'response' | 'notification'` 或等价判别字段）；`createResponseMessage` 扩展时**不得破坏既有调用签名**（新增可选字段）。
- `ws-server` 读取请求 `reqId` 并透传到响应；**data 原样透传**，不解析业务。
- 旧客户端（不带 `reqId`）行为**逐字节兼容**。
- 与任务 3 的 `traceId` 语义不要混用。

## 3. 测试（`packages/core-framework/src/protocol.test.ts` 等）

- [ ] 带 `reqId` → 响应回显；不带 → 响应无 `reqId`
- [ ] `kind` 取值正确，广播与响应可区分
- [ ] JSON codec 往返不破坏既有解析
- [ ] `createResponseMessage` 旧调用形式仍编译通过

## 4. 消费方升级后的验收（A 侧执行）

- SDK（`packages/server/scripts/sdk/ws-client.ts`）改为 `reqId` 配对，**移除串行队列**并回归 `e2e:all`/`e2e:journey`
