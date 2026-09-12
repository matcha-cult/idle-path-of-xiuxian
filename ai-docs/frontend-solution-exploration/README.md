# 前端方案探索（frontend-solution-exploration）

> 面向「放置·修仙之路」后端（NestJS + ionet-ts）的**独立前端客户端**架构探究。
> 目标：一个新的、与后端零耦合的前端，先承载 PC 与手机浏览器，后期扩展微信/QQ 小程序。
> 本文件夹所有结论均以仓库内真实源码为依据（`vendor/ionet-ts/packages/**`、`packages/server/src/**`），非猜测。

---

## TL;DR（先看结论）

1. **前后端如何"零耦合"**：后端对外唯一的真相是**线协议**——WS 文本帧 JSON 信封：请求 `{cmd, subCmd, data?}`，响应 `{data?, errorCode?, errorMessage?}`，路径 `/ws`，服务端 30s ping 心跳。任何语言照此信封收发即可接入，这就是"一后端、多前端"的根基。详见 [01-后端通信协议实录](./01-后端通信协议实录.md)。

2. **前端必须自建零依赖 SDK（ionet-client）**：浏览器里**严禁 import `@nbb-ionet/*`**（core-framework 依赖 node:async_hooks，会炸）。前端以 `SocketAdapter`（平台差异）+ `EnvelopeCodec`（JSON/二进制可插拔）+ 关联策略（v1 串行队列、预留 reqId 升级位）三接口实现，环境无关、可独立发布。详见 [02-前端总体架构](./02-前端总体架构.md)。

3. **技术栈**：React + Vite + MobX 6 + TypeScript 5。装饰器"老是出错"的三大根因（`useDefineForClassFields` 与 legacy 装饰器互斥、工具链管线不一致、多余配置）逐一给出解法；**推荐方案 A：`experimentalDecorators: true` + `useDefineForClassFields: false`**，并配 CI 三连闸 + 装饰器冒烟用例防回归。详见 [03-技术选型与TS装饰器工程化](./03-技术选型与TS装饰器工程化.md)。

4. **已做决策 10 项、风险 8 条、待后端拍板 8 问**：都不阻塞开工；v1 按最保守事实实现。详见 [04-决策矩阵与风险](./04-决策矩阵与风险.md)。

---

## 关键事实速查

| 项 | 事实 | 出处 |
|---|---|---|
| WS 地址 | `ws(s)://<host>[:port]/ws`（可配置 path） | 01 §4 |
| 请求帧 | `{"cmd":30,"subCmd":1,"data":{...}}`（文本帧 JSON） | 01 §3 |
| 响应帧 | `{"data":...,"errorCode":0,"errorMessage":""}`——**无 cmd 回显、无 reqId** | 01 §3 |
| 心跳 | 服务端 `ws.ping()` 30s，浏览器 JS 观察不到 → 需应用层 `system.ping` 心跳（15s/10s） | 01 §4 / 02 §3.3 |
| 错误码 | 0=成功；400 坏帧；404 Action 未注册；500 内部 | 01 §3.3 |
| 编码 | 默认 JSON；jprotobuf 二进制预留（typeName 前缀 + protobuf 载荷） | 01 §5 |
| 后端现状 | 业务全走 REST（/api，JWT）；ionet WS 仅注册了 system.ping | 01 §6 |
| 前端红线 | 不 import 任何 `@nbb-ionet/*`；DTO 自行维护、codegen 产物仅参考 | 01 §9 / 01 §7 |
| 多端 | 差异全部收敛在 SocketAdapter + 平台工具；微信/QQ 仅加适配器 | 02 §5 |

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [01-后端通信协议实录](./01-后端通信协议实录.md) | 线协议源码级事实：信封、心跳、编解码 SPI、广播、错误语义、codegen 产物、禁导入红线 |
| [02-前端总体架构](./02-前端总体架构.md) | 分层架构、ionet-client SDK 设计（关联策略/状态机/推送路由/认证/时间同步）、多端就绪、工程结构 |
| [03-技术选型与TS装饰器工程化](./03-技术选型与TS装饰器工程化.md) | React+Vite+MobX 选型、装饰器三大根因、legacy/标准/无装饰器三路线、防回归基建 |
| [04-决策矩阵与风险](./04-决策矩阵与风险.md) | 10 项决策、8 条风险缓解、8 个待后端确认问题、M0~M4 里程碑 |

---

## 建议下一步

1. 将 [01](./01-后端通信协议实录.md) 发给后端团队确认：WS 鉴权形态、reqId 回显、广播信封规范、业务错误码表（04 §3 的 Q1~Q8）；
2. 评审本套方案（重点：串行队列策略是否满足玩法预期、是否立项 reqId 升级）；
3. 按 04 §4 的 **M0 协议桩 → M1 SDK → M2 应用骨架 → M3 业务接入** 顺序开工。