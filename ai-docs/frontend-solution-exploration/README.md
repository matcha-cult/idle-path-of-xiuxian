# 前端方案探索（frontend-solution-exploration）

> 面向「放置·修仙之路」后端（NestJS + ionet-ts）的**独立前端客户端**架构探究。
> 目标：一个新的、与后端零耦合的前端，先承载 PC 与手机浏览器，后期扩展微信/QQ 小程序。
> 本文件夹所有结论均以仓库内真实源码为依据（`vendor/ionet-ts/packages/**`、`packages/server/src/**`），非猜测。

> ⚠️ **状态提示（2026-09-13）**：01~05 写于 09-12，其"现状事实"层已被 09-13 的协议加固推翻。
> **实施 1.5 请以 [06-现状校正与实施基线](./06-现状校正与实施基线（2026-09-13）.md) 与 `vendor/ionet-ts/PROTOCOL.md` 为准**；
> 下文带 ~~删除线~~ 或【已过时】标记处均已在校正文档中改写。

---

## TL;DR（先看结论）

1. **前后端如何"零耦合"**：后端对外唯一的真相是**线协议**——WS 文本帧 JSON 信封：请求 `{cmd, subCmd, data?, headers?, traceId?, reqId?}`，响应 `{data?, errorCode?, errorMessage?, reqId?, kind?}`，推送 `{kind:'notification', cmd?, subCmd?, type?, data, timestamp?}`；路径 `/ws`，服务端 30s ping 心跳。任何语言照此信封收发即可接入，这就是"一后端、多前端"的根基。**规格源：`vendor/ionet-ts/PROTOCOL.md`**。详见 [06](./06-现状校正与实施基线（2026-09-13）.md) / [01](./01-后端通信协议实录.md)。

2. **前端自建 SDK，但协议层不再自造**（【已过时】原文为"严禁 import 任何 `@nbb-ionet/*`"）：协议层已由浏览器安全的 **`@nbb-ionet/client-protocol`** 提供（零 Node 依赖、可 workspace 引用），前端只需自建 **transport（`BrowserSocketAdapter`）+ client 状态机（重连/心跳）+ 认证钩子 + API/DTO 层**。红线改为**白名单**：禁 Node-only 的 `core-framework`/`external-server`/`extension-nestjs`/`redis`，**允许 `client-protocol`**。详见 [06 §1 S1/§3](./06-现状校正与实施基线（2026-09-13）.md) / [02](./02-前端总体架构.md)。

3. **技术栈**：React + Vite + MobX 6 + TypeScript 5。装饰器"老是出错"的三大根因（`useDefineForClassFields` 与 legacy 装饰器互斥、工具链管线不一致、多余配置）逐一给出解法；推荐方案 A（`experimentalDecorators: true` + `useDefineForClassFields: false`），**但前端无 DI 需求，方案 C（`makeAutoObservable`）可整类消除工具链风险**；配 CI 三连闸 + 装饰器冒烟用例防回归。详见 [03](./03-技术选型与TS装饰器工程化.md) / [06 §6](./06-现状校正与实施基线（2026-09-13）.md)。

4. **已做决策 11 项、风险 10 条、开放问题 9 个**：其中 Q1/Q2/Q3/Q4/Q8 已因协议加固关闭，**业务错误码表（Q5）、`serverTime`（Q6）、生产部署形态（Q7）、HTTP fallback（Q9）仍开放**。详见 [04](./04-决策矩阵与风险.md) / [06 §5](./06-现状校正与实施基线（2026-09-13）.md)。

5. **~~ionet-ts 是作者自研、无社区热度 → 现在改协议是黄金窗口~~（【已完成】）**：05 号清单列出的 5 个 P0 级协议缺陷（`sendTo` 定向推送断链、请求关联缺失、判别字段缺失、Action DI 隔离、握手鉴权缺位）**已于 2026-09-13 全部加固并验收**，`PROTOCOL.md` 已落地，A1 一致性套件 / A2 浏览器参考客户端 / A3 浏览器安全协议包均已交付。05 号文档保留为改造历史记录，**实施时请对照 [06 §1](./06-现状校正与实施基线（2026-09-13）.md) 的勘误表**。

---

## 关键事实速查

| 项 | 事实（2026-09-13 校正后） | 出处 |
|---|---|---|
| WS 地址 | `ws(s)://<host>[:port]/ws`（attach NestJS `http.Server`，可配置 path） | 06 §1 S2 / `app.module.ts:66-68` |
| 请求帧 | `{"cmd":30,"subCmd":1,"data":{…},"reqId":"r-1"}`（文本帧 JSON；`reqId` 可选，带则启用并发关联） | `PROTOCOL.md §3` |
| 响应帧 | `{"data":…,"errorCode":0,"reqId":"r-1","kind":"response"}`——**不回显 `cmd/subCmd`**；`reqId`/`kind` 仅在请求带 `reqId` 时出现 | `PROTOCOL.md §4` |
| 推送帧 | `{"kind":"notification","cmd"?:…,"subCmd"?:…,"type"?:…,"data":…,"timestamp":…}` | `PROTOCOL.md §5` |
| 请求关联 | **reqId 精确配对 + FIFO 回退**，同连接可并发多请求（`RequestResponseAssociator`） | `PROTOCOL.md §4.1` |
| 鉴权 | **握手期** `authenticate`：浏览器 `?token=<jwt>`、Node `Authorization: Bearer`；失败 HTTP 401 拒升级 | `PROTOCOL.md §6` |
| 心跳 | 服务端 `ws.ping()` 30s（JS 观察不到）→ 客户端用应用层 `system.ping (1,1)`（15s/10s，**免鉴权**） | `PROTOCOL.md §7` / `cmd.ts` |
| 错误码 | **传输层**：0=成功；400 坏帧；404 Action 未注册；500 内部异常 | `PROTOCOL.md §8` |
| 业务错误 | **`errorCode` 仍为 0，但 `data.success === false`、`data.data.code` 为业务码**（`UNAUTHORIZED`/`INVALID_PARAM`/`CHARACTER_NOT_FOUND`/`FORBIDDEN`）——必须额外判定 | 06 §2 / `action-support.ts` |
| 编码 | 默认 JSON（未知字段透传）；jprotobuf 二进制为移植版私有自描述格式 + 机器可读 schema | `PROTOCOL.md §2/§13` |
| 后端现状 | **WS 优先**：`/ws` 注册 12 个 Action（cmd 1/30/40/50/60/70/80/90/100/110/120/130）；REST 仅 `auth`/`character`/`health` | 06 §1 S2/S6 |
| 前端红线 | 禁 import Node-only `@nbb-ionet/*`（`core-framework`/`external-server`/`extension-nestjs`/`redis`）；**白名单例外 `@nbb-ionet/client-protocol`** | 06 §1 S1 |
| 定向推送 | `broadcastNotification`/`sendNotification`/`Broadcaster.*` 可用（`IONET_BROADCASTER` 已接线，`verify:sendto` PASS） | `PROTOCOL.md §10` |
| HTTP fallback | `POST /{prefix}/{cmd}/{subCmd}` **代码就绪但本项目未启用**（`httpServer:false`），且不产生 `reqId`/`kind` | `PROTOCOL.md §9/§9.1` |
| 多端 | 差异全部收敛在 SocketAdapter + 平台工具；微信/QQ 仅加适配器 | 02 §5 |

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [**06-现状校正与实施基线（2026-09-13）**](./06-现状校正与实施基线（2026-09-13）.md) | **★ 实施 1.5 必读**：01~05 勘误表（S1~S9 + 业务错误遗漏）、A3 能力边界、T0~T4 实施基线、开放问题现状 |
| [01-后端通信协议实录](./01-后端通信协议实录.md) | ⚠️ **历史实录（09-12）**，事实层已过时；线协议请以 `PROTOCOL.md` 为准 |
| [02-前端总体架构](./02-前端总体架构.md) | 分层架构、SDK 设计（关联策略/状态机/推送路由/认证/时间同步）、多端就绪、工程结构 |
| [03-技术选型与TS装饰器工程化](./03-技术选型与TS装饰器工程化.md) | React+Vite+MobX 选型、装饰器三大根因、三路线对比、防回归基建（配置示例见 06 §6 勘误） |
| [04-决策矩阵与风险](./04-决策矩阵与风险.md) | 11 项决策、8 条风险缓解、开放问题、里程碑（Q1~Q4/Q8 已关闭，里程碑见 06 §4） |
| [05-框架作者视角的协议加固清单](./05-框架作者视角的协议加固清单.md) | ⚠️ **改造历史记录（09-12）**：P0/P1/P2 清单**已全部落地并验收**，保留作演进依据 |

---

## 建议下一步

1. **先读 [06-现状校正与实施基线](./06-现状校正与实施基线（2026-09-13）.md)**——它是 1.5 的唯一开工依据；01~05 的事实层不要直接照做。
2. **协议加固已完成**（原 05 号清单 P0-1~P2-2 全部落地）：`PROTOCOL.md` 已是框架内唯一规格源，A1/A2/A3 已交付；无需再做框架改造。
3. 按 [06 §4](./06-现状校正与实施基线（2026-09-13）.md) 的 **T0 契约锁定 → T1 接线冒烟 → T2 transport+状态机 → T3 登录到面板 → T4 业务分批接入** 开工。
4. 立项前仍需后端确认：**业务错误码表（Q5）** 与 **`serverTime` 字段（Q6）**；若需 HTTP 降级，另行决定 **Q9（HTTP fallback 启用 + 独立前缀）**。