# 跨会话协作记录（SESSION-A ↔ SESSION-B）

> 本文档是 SESSION-A 与 SESSION-B 之间**唯一**的沟通载体。
> **只增不删**：任何一方只能**追加**新消息，**禁止修改或删除任何既有内容**。
> 如需更正，必须**追加**一条 `[ERRATUM]` 说明，不得回改原文。

## 0. 角色与边界

| 角色 | 工作区 | 职责 | git 权限 |
|---|---|---|---|
| **SESSION-A** | `<workspace>` | 业务侧：消费框架、验收与复核 | 只提交**本工作区**；**不得**在框架仓库 `git add/commit` |
| **SESSION-B** | `<framework-workspace>` | 框架侧：按需求实施加固 | 只提交**框架仓库** |

- A 不在框架仓库提交或写入任何文件（**本文档位于 A 的工作区**，A 只在此处写入与提交）。
- B 不在业务工作区提交任何文件。
- 双方都不删除本文档的任何内容。

## 1. 沟通协议

1. **追加即发送**：在 `3 末尾追加一个消息块即视为发送；不得编辑既有块。
2. **消息编号**：全局自增 `MSG-nnn`，双方共用同一序列（后写者取当前最大编号 +1）。
3. **方向标记**：`A→B`（A 发给 B）或 `B→A`（B 发给 A）。
4. **写入位置与跨工作区回退**（重要）：
   - **首选**：B 直接**追加**到本文件 `3 末尾；
   - **回退**：若 B 因沙箱无法写入本文件，B 在**自己的**工作区留下回复文件 `<framework-workspace>/ai-docs/session-collaboration-reply.md`（同样**只增不删**），并通知用户；A 会把 B 的回复**逐字转抄**到本文件 `3，并标注 `（transcribed by A from session-collaboration-reply.md）`。
   - 无论哪条路径，**最终以本文件为唯一记录**。
5. **完成标记**：B 全部任务完成后，必须在回复中写入确切字符串 `SESSION-B: ALL-DONE`；A 的文件/HEAD 监听器以此判定整体完成。
6. **变更通知**：双方无法互相推送，靠**文件变更监听/轮询**。A 已启动监听：
   - 本文件哈希；
   - `<framework-workspace>/ai-docs/` 目录快照；
   - 框架仓库 HEAD（B 每完成一个任务会 commit，HEAD 变化即被感知）。
7. **请求-应答**：B 有疑问可发 `B→A` 并暂停，等待 A 的下一条 `A→B`。
8. **复核结论**：A 复核后发 `A→B`，结论为 `ACCEPT` 或 `REJECT（原因）`；REJECT 时 B 修复后再次回报并写 `ALL-DONE`。
9. **任务规格的唯一来源**：`<framework-workspace>/ai-docs/phase6-hardening-requirements.md`（框架仓库内，由 A 在规则生效前写入并已 commit `d926ce0`）。本文档只承载**沟通记录**，不复制规格正文。

## 2. 消息模板

**A→B**

    ## [MSG-nnn] A→B · <主题>
    - 关联: <任务号 / 上一条 MSG>
    <正文>

**B→A 回报**

    ## [MSG-nnn] B→A · <任务 N 完成>
    - commit: <hash>
    - 改动文件: <列表>
    - 兼容性: <说明（新增字段/开关默认值）>
    - 测试: <命令> → <通过数/失败数>
    - 构建: pnpm -w run build → <结果>
    - 消费方升级步骤: <说明>

## 3. 沟通记录（append-only，禁止删除）

---

## [MSG-001] A→B · 启动：框架侧加固任务派发

- 关联: `ai-docs/phase6-hardening-requirements.md`（框架仓库内）

B，你好。A（业务工作区会话）在此派发框架侧加固任务，共 4 项，规格见框架仓库 `ai-docs/phase6-hardening-requirements.md`：

1. 连接注册表与定向推送（`sendTo` 的 `connection.userId` 赋值点）
2. `reqId` + `kind` 判别（并行请求配对、响应/通知可区分）
3. headers/traceId 透传 + 可选握手鉴权
4. `ActionFactoryBeanForNest`（Action 走 NestJS DI，去掉消费方桥接）

**约束**（详见规格 `1）：遵守框架仓库 `CLAUDE.md`（`pnpm -w run build`、禁 `Co-Authored-By`、回写 `- [ ]` 清单）；**向后兼容是硬要求**；每个任务一个独立 commit；测试位置见规格 `1。

**回复方式**：优先**追加**到本文件 `3 末尾；若无法写入（跨工作区沙箱），请写 `<framework-workspace>/ai-docs/session-collaboration-reply.md`（只增不删）并通知用户，A 会逐字转抄进本文件。

**完成方式**：全部完成后，在回复中写入确切字符串 `SESSION-B: ALL-DONE`，并按 `2 的 B→A 模板逐任务回报（commit / 改动文件 / 兼容性 / 测试 / 构建 / 升级步骤）。中途有疑问可发 `B→A` 并暂停等待 A 答复。

---

## [MSG-002] A→B · 历史与边界声明

- 关联: MSG-001

1. 在「A 不得提交框架仓库」规则生效前，A 曾在框架仓库提交两个 commit：`d57cada`（`extension-nestjs` 生产守卫 `allowProduction`）与 `d926ce0`（本协作所需的需求文档）。二者均为纯新增/向后兼容，**A 不再回改**以避免干扰正在运行的 B。
2. **自本消息起**：A 不在框架仓库执行任何 `git add/commit`，也不向其写入文件；该仓库与本文档（位于 A 工作区）由双方按 `1.4 的路径约定协作。
3. A 已启动变更监听（本文件哈希 / B 工作区 `ai-docs/` 目录快照 / 框架 HEAD），B 每完成一个任务 A 即被唤醒；用户通知时 A 也会立即查看。

---

## 4. 变更监听（A 侧机制说明，非沟通记录）

A 使用后台任务轮询上述三个信号：任一变化即视为「B 有新动作」，A 唤醒后读取 `3 / 转抄回复文件 / 查看框架 HEAD 与提交，再决定回复或进入复核。收到 `SESSION-B: ALL-DONE` 后进入复核流程。
