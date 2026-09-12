# 跨会话协作约定（SESSION-A ↔ SESSION-B）

> 本目录是跨会话协作的**任务文件**；**沟通记录**始终只有一份：`../session-collaboration.md`（**只增不删**）。
> 本文件只描述约定，不承载沟通记录。

## 0. 角色与边界

| 角色 | 工作区 | 职责 | git 权限 |
|---|---|---|---|
| **SESSION-A** | `<workspace>` | 业务侧：消费框架、验收与复核 | 只提交**本工作区**；不在框架仓库 `git add/commit` |
| **SESSION-B** | `<framework-workspace>` | 框架侧：按任务实施加固 | 只提交**框架仓库** |

## 1. 文件布局（按任务区分）

| 文件 | 用途 |
|---|---|
| `../session-collaboration.md` | **唯一**沟通记录（append-only，禁止删除） |
| `task-1-connection-registry.md` | 任务 1 规格：连接注册表与定向推送 |
| `task-2-reqid-kind.md` | 任务 2 规格：`reqId` + `kind` 判别 |
| `task-3-handshake-auth.md` | 任务 3 规格：headers/traceId 透传 + 握手鉴权 |
| `task-4-action-factory.md` | 任务 4 规格：`ActionFactoryBeanForNest` |

- 每个任务文件**自包含**（背景/证据/要求/测试/兼容/回报格式），B 可**一次只做一个任务文件**。
- 任务文件的地址为**绝对路径**：
  `<workspace>/ai-docs/cross-session/task-N-*.md`
- 框架仓库内另有一份汇总版（规则生效前由 A 写入并提交 `d926ce0`）：`ai-docs/phase6-hardening-requirements.md`。以**本目录的按任务文件为准**。

## 2. 沟通协议（摘要，细则见 `../session-collaboration.md`）

1. **追加即发送**，只增不删；更正用 `[ERRATUM]` 追加。
2. 消息编号 `MSG-nnn` 全局自增，方向标记 `A→B` / `B→A`。
3. **写入位置**：优先 B 追加到 `../session-collaboration.md`；若跨工作区沙箱不可写，B 写
   `<framework-workspace>/ai-docs/session-collaboration-reply.md`（同样只增不删）并通知用户，A **逐字转抄**进主记录。
4. **完成标记**：全部任务完成后回复中必须含确切字符串 `SESSION-B: ALL-DONE`。
5. **变更感知**：A 监听（主记录哈希 / B 的 ai-docs 目录快照 / 框架 HEAD），B 每 commit 一次 A 即被唤醒。
6. **复核**：A 逐任务发 `ACCEPT` 或 `REJECT（原因）`。
7. **纪律**：遵守框架仓库 `CLAUDE.md`（`pnpm -w run build`、禁 `Co-Authored-By`、回写 `- [ ]`）；**向后兼容是硬要求**；每任务独立 commit。

## 3. 通用完成标准（每个任务都适用）

- [ ] 代码改动 + 与源码同目录/`tests` 的 vitest 用例
- [ ] `pnpm -w run build` 通过
- [ ] `pnpm --filter <pkg> run test` 全绿
- [ ] 向后兼容（新增字段/开关默认保持现状）
- [ ] 独立 commit（不含 `Co-Authored-By`）
- [ ] 在沟通记录中按模板回报
