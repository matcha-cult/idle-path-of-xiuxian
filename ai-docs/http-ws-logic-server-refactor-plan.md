# HTTP/WS 双通道与「逻辑服」拆分改造计划（v2）

> 目标（对齐原始需求）：
> 1. 注册、登录、角色列表、角色创建、健康检查等**基础能力走 HTTP**；**其余游戏交互全部走 ionet-ws**。
> 2. 把不同功能拆成**不同的逻辑服（ionet ActionController）**，**交由 ionet 统一管理**；逻辑服之间**允许依赖、禁止循环依赖**；**对外服**单独承担广播/通知等对外逻辑。
>
> 现状：要求 1 的 HTTP 半句已满足；ionet-ws、逻辑服、对外服三条均未落地。

---

## 0. 目标形态

```
客户端
  │
  ├── HTTP /api/*        NestJS REST：auth / character / health（基础，低频）
  │
  └── WS   /ws           ionet 外部服（对外服）—— 连接·握手鉴权·路由·广播·通知·推送
                              │  按 {cmd, subCmd} 把请求分发给逻辑服
                              ▼
                        ionet BarSkeleton 路由表
                        ├── 逻辑服各自一个 @ActionController(cmd)
                        └── 逻辑服之间：允许单向依赖，禁止环
```

## 1. 通道职责

| 能力 | 通道 | 归属 |
|---|---|---|
| 注册 / 登录 | HTTP | auth（基础） |
| 角色列表 / 创建 / 信息 | HTTP | character（基础） |
| 健康检查 | HTTP | health（@Public） |
| 其余所有游戏交互 | **WS** | 各逻辑服（见 §3） |
| 广播 / 通知 / 推送 / 连接握手 | **WS** | **对外服**（不承载业务路由） |

## 2. 前置决策

| 编号 | 决策 | 取值 |
|---|---|---|
| D1 | 「逻辑服」形态 | 单进程内按 cmd 分段的多个 `@ActionController`（ionet-ts 无跨进程路由）；**按 §3 分层，可未来物理拆分** |
| D1.1 | 物品 / 道具划分 | **已定稿（原话「物品、道具一个逻辑服」系笔误）**：拆分为 **物品逻辑服**（基础：定义/词缀/实例化/背包存储）+ **道具逻辑服**（流转：获得/消耗/丢弃/分解），**道具 → 物品** |
| D2 | WS 传输模式 | attach 到 NestJS http.Server，path=`/ws` |
| D3 | dev 工具（generate/grant/spawn/kill） | 也迁 WS，Action 内保留生产禁用 + 限流 |
| D4 | 是否改 `vendor/ionet-ts` | 不作为验收前置（Track A 全在 `packages/server`）；框架加固列 M6 |
| D5 | cmd 分段 | 见 §3，M0 定稿 |
| **D6** | **依赖约束** | **逻辑服只能依赖「更底层」的逻辑服；禁止循环依赖；跨服只走对方导出的门面服务，禁止直接访问对方数据表。** |

## 3. 逻辑服划分与依赖 DAG（核心）

### 3.1 DAG

```
                  ┌─────────────────────────────────────────────────┐
                  │ 对外服 (External / Edge)                          │
                  │ WS 接入 · 握手鉴权 · 广播 · 通知 · 推送            │
                  │ 不参与业务依赖图；逻辑服经 NotificationPort 单向投递│
                  └─────────────────────────────────────────────────┘
                          ▲ (单向：业务 → 端口实现)
  ─────────────────────────────────────────────────────────────────
  L4 挂机      idle 挂机处理逻辑服
                  │  依赖 ↓
  L3 任务/剧情 quest 任务逻辑服 ──▶ story 剧情逻辑服（story → quest）
                  │  依赖 ↓
  L2 秘境      zone 秘境逻辑服
                  │  依赖 ↓
  L1 战斗      combat 战斗逻辑服        realm 境界逻辑服
                  │        │                  │
                  │        └── economy 通货/炼器逻辑服
                  │  依赖 ↓
  L0 派生      prop 道具逻辑服 ── equip 装备逻辑服 ── skill 功法逻辑服
                  │  依赖 ↓
  L-1 基础     item 物品逻辑服   character 角色(HTTP)   system / stat 基础设施
```

> 边方向固定为「上层 → 下层」。只要所有边向下，就天然无环；新增依赖必须落在下层，否则 CI 的环检测会失败。

### 3.2 逻辑服清单

| 逻辑服 | cmd（提案） | 职责 | 允许依赖 | 现有代码来源 |
|---|---|---|---|---|
| system | 1 | ping/健康 | — | `ionet/health.action.ts` |
| auth（HTTP） | 10 | 注册/登录/JWT | — | `modules/auth` |
| character（HTTP） | 20 | 角色创建/查询/属性读取 | — | `modules/character` |
| **item 物品** | 30 | 物品基底/词缀/实例化/背包**存储**基底读写/拾取规则 | — | `ItemAffixService` + `ItemService` 存储部分 |
| **prop 道具** | 40 | 道具**获得/消耗/丢弃/分解/出售** 的流转与门禁 | item | `ItemService` 流转部分 |
| **equip 装备** | 50 | 穿戴/卸下/装备栏/属性聚合 | item | `ItemService` 装备部分 |
| **skill 功法** | 60 | 修习/装配/参悟 | character | `skill.service` |
| **economy 通货** | 70 | 通货/精华/炼器十四操作 | item, prop | `currency.service` + `craft.service` |
| **realm 境界** | 80 | 境界突破 | character, prop | `realm.service` |
| **combat 战斗** | 90 | 单位实例化/击杀结算/掉落/辨宝 | item, equip | `unit.service` |
| **zone 秘境** | 100 | 层数挑战/推进/解锁 | combat, item, equip | `zone.service` |
| **quest 任务** | 110 | 任务流转/章节 | zone, combat, item | `quest.service` + `chapter.service` |
| **story 剧情** | 120 | 剧本节点/已读 | quest | `story.service` |
| **idle 挂机** | 130 | 离线收益结算循环 | item, equip, combat, zone | `idle.service` |
| **对外服** | — | 连接/握手/广播/通知/推送 | 只实现端口，不依赖业务 | `WebSocketExternalServer` + 新增 EdgeModule |

### 3.3 与用户约定的对照

| 用户约定 | 计划落点 |
|---|---|
| 物品 / 道具（原话「一个逻辑服」系笔误） | `item`（基础存储）+ `prop`（获得/消耗流转），**prop → item** |
| 对外服处理广播/通知 | **对外服 EdgeModule**（§4.3），独立于逻辑服 |
| 挂机处理逻辑服 | `idle`，依赖 item/equip/combat（并额外依赖 zone，见风险 R4） |
| 道具 → 物品 | `prop → item` ✅ |
| 战斗 → 物品 + 装备 | `combat → item, equip` ✅ |
| 挂机 → 物品 + 装备 + 战斗 | `idle → item, equip, combat` ✅ |
| 禁止循环依赖 | §4.4 机制 + CI 环检测 |

## 4. 关键机制

### 4.1 Action ↔ NestJS DI 桥接（Track A，无 vendor 改动）
`BarSkeleton.addAction(ActionClass)` 不传 instance 时直接 `new`（`bar-skeleton.ts:44-49`），业务 Action 拿不到 DI。方案：
1. 每个逻辑服的 Action 类标 `@Injectable()`，在本服 Nest 模块注册为 provider。
2. 新增 `GameActionBridgeModule`：`@Inject(IONET_BAR_SKELETON)` + `ModuleRef.get(ActionClass,{strict:false})`，在 `onModuleInit` 里 `skeleton.addAction(ActionClass, instance)`。
3. 时序安全：所有 `onModuleInit` 早于 `app.listen()`。

> ⚠️ **Action 方法签名约定**：固定 `(ctx: FlowContext, data: unknown)`，且 `FlowContext` 必须**以值导入**。
> `import { type FlowContext }` 会被 tsc 擦除，`emitDecoratorMetadata` 只能退化成 `Function`，
> 骨架据此把首参误判为 `DATA`（实测表现为 `ctx.getUserId is not a function`）。
>
> Track B 可选：框架补 `ActionFactoryBeanForNest`（`05` P1-1）后可去桥接。

### 4.2 WS 鉴权（v1）
`ws-server` 丢弃 headers、每请求新建 `FlowContext`、无握手鉴权。v1：JWT 放入请求 `data.__token`，自定义 `WsAuthInOut` 校验后 `ctx.bindingUserId(BigInt(id))`；受保护 Action 校验 `getUserId() !== 0n`。M6 转标准握手鉴权。

### 4.3 对外服（EdgeModule）
- **职责**：WS 连接生命周期、握手/鉴权、响应回写、**广播/通知/推送**、连接↔userId 注册表。
- **依赖反转**：在 `common/ports` 定义 `NotificationPort { broadcast(msg); sendTo(userId,msg) }`；逻辑服只依赖接口并投递，**对外服实现接口**。这样业务→端口→实现，无环。
- **框架现状**：`broadcast()` 可用；`sendTo()` 因 `ClientConnection.userId` 无赋值点而失效（`05` P0-4）；Broadcaster 抽象未接线（P0-5）。v1 由 EdgeModule 注入 `IONET_WS_SERVER` 实现广播；定向推送 + 推送信封规范化列入 M6。

### 4.4 依赖约束的强制手段
1. **物理边界**：每服目录 `src/modules/logic/<server>/`，只导出 1 个门面 `XxxLogicService` + Action 类；`internal/` 私有。
2. **只走门面**：跨服调用只允许调用对方门面；**禁止跨服直接读写对方表**。
3. **静态检查**：`.dependency-cruiser.cjs`（或 ESLint `no-restricted-imports` zones）按 §3 层级配置——低层禁止 import 高层。
4. **环检测**：CI 跑 `depcruise --validate` 或 `madge --circular src`，**任何环即失败**。
5. **契约测试**：每个新依赖必须更新 §3.2 的「允许依赖」列，评审时对照。

## 5. 里程碑与任务

### M0 · 定稿（纯文档）✅ 已完成
- [x] D1.1 已定稿：item / prop 拆分为两服，**道具 → 物品**
- [x] 敲定逻辑服清单与依赖 DAG（§3），写回 `src/ionet/cmd.ts` 全量分配（每域一个 `XXX_CMD`）
- [x] 输出 WS 接口契约（信封/鉴权/错误码）：`ai-docs/ws-protocol-contract.md`
- [x] 明确每服门面 API 与「允许依赖」清单：契约 §6 + `scripts/check-deps.mts` 的 `ALLOWED_DEPS`

### M1 · 通道与骨架 ✅ 已完成
- [x] `app.module.ts`：`IonetModule.forRoot({ actions: [], httpServer: false, wsServer: { attachNestServer: true, path: '/ws' }, redis: false })`（Action 统一由桥接模块注册）
- [x] `main.ts`：listen 前 `app.get(IonetModule).attachHttpServer(app.getHttpServer())`；移除 `WsAdapter`
- [x] 删除 `modules/ws/*`（避免与 attach 模式 upgrade 冲突）
- [x] `WsAuthInOut` + `GameActionBridgeModule`（用应用内工厂令牌收集实例，规避跨副本类令牌注入静默失败）
- [x] **对外服 EdgeModule + NotificationPort** 骨架（`common/ports/notification.port.ts` + `modules/edge`）
- [x] 依赖检查工具接入：`pnpm run check:deps`（自包含 TS 实现，替代 depcruise/madge，离线可用）+ `pnpm run verify`
- [x] 冒烟：`{cmd:1,subCmd:1}` 返回 ok（`pnpm run smoke:ws`）；HTTP 回归 401/200/201 通过
- [x] **既有缺陷修复**：`tsx`(esbuild) 不产出 `design:paramtypes`，导致全 HTTP 500 → 新增 `scripts/dev.mjs`（tsc --watch + node --watch）

### M2 · 打样（idle）✅ 已完成
- [x] 建 `modules/logic/idle/{idle.action.ts, idle.logic.service.ts, idle-logic.module.ts}`（`@ActionController(130)`+`@ActionMethod`+`@Injectable`）
- [x] 只依赖本服门面（`IdleLogicService`）+ 同服实现，`check:deps` 通过
- [x] 对照旧 REST 行为：(130,1)=GET /api/game/idle/status、(130,2)=POST /api/game/idle/settle
- [x] 沉淀 Action 化模板（见 `idle.action.ts` 顶部注释）+ 端到端脚本 `pnpm run e2e:idle`

### M3 · 按依赖层自底向上迁移 ✅ 已完成（Action 面全部落地）
- [x] L-1 item（+ 拾取规则，按 D1.1）
- [x] L0 prop、equip、skill
- [x] L1 economy、realm、combat
- [x] L2 zone
- [x] L3 quest、story
- [x] L4 idle（M2 已完成）
- [x] 每层独立提交；每服跑环检测（`pnpm run check:deps`：104 文件无环、无越层）
- [x] 修正现存越层依赖（见 R4）：`skill→item`、`combat→realm` 已上提 `common/kernel`
- [x] 启动期重复路由断言（`GameActionBridgeModule.assertNoDuplicateRoutes`）
- [x] 端到端：`pnpm run e2e:all`（16 只读 + 生成/穿戴/卸下/丢弃写入链路 + 鉴权拦截）
- 备注：本层各服 Action 委托既有 `modules/game/<domain>` 服务实现；服务实现按服物理搬迁（`modules/game/*` → `modules/logic/*/internal`）留待 M4 一并处理。

### M4 · 下线 REST 游戏接口
- [ ] 删除 `modules/game/**/*.controller.ts`；保留 Service/DB/配置
- [ ] `README.md` HTTP 表收敛为基础接口，新增 WS Action 表与依赖图
- [ ] 回归全局 JWT Guard

### M5 · 端到端验收
- [ ] 前端 SDK 接 `/ws`（串行队列 + 应用层心跳）
- [ ] 注册→登录→建角→拉背包→装备→突破→秘境→任务
- [ ] 断线重连后重新带 token 可继续

### M6 · 可选框架加固（独立仓库）
- [ ] `ActionFactoryBeanForNest`（去桥接）
- [ ] headers/traceId 透传 + 握手鉴权
- [ ] 连接注册表 + Broadcaster 接线 + 定向推送（对外服正式化）
- [ ] reqId + `kind` 判别
- [ ] `NODE_ENV=production` 守卫与生产部署路径

## 6. 验收标准

| # | 验收项 | 通过条件 |
|---|---|---|
| A1 | 基础走 HTTP | auth/character/health 全部可用 |
| A2 | 游戏交互走 WS | REST 无 `/api/game/*`；游戏能力在 `/ws` 命中 |
| A3 | 功能拆为不同逻辑服 | 每服独立 `@ActionController(cmd)`，注册进 `BarSkeleton` |
| A4 | 交由 ionet 管理 | 统一走 `BarSkeleton.execute`；`cmd.ts` 全量分配、无重复路由 |
| A5 | 鉴权一致 | 无合法 token 调受保护 Action 必失败 |
| A6 | 行为不回退 | 迁移前后业务结果一致（含 dev 限流/生产禁用） |
| **A7** | **依赖无环** | **依赖检查工具通过；低层不依赖高层；无跨服直连数据表** |
| **A8** | **对外服独立** | **广播/通知由对外服实现；逻辑服只依赖 NotificationPort，不反向依赖业务** |

## 7. 风险与缓解

| # | 风险 | 缓解 |
|---|---|---|
| R1 | Action 无 DI（框架 P1-1） | §4.1 桥接；M6 修复 |
| R2 | WS 无 headers/握手鉴权 | v1 token 入 data；M6 握手 |
| R3 | 无连接 session/定向推送 | 本期不要求推送；对外服先广播；M6 修 `sendTo` |
| R4 | **现存越层依赖**（M0 已复核完毕） | 复核结论：`idle → zone`、`zone → unit`、`craft → stat`、`quest/realm/unit → stat` 均为**向下**边，与 §3 一致；另发现两处**值依赖**越层 `skill → item`（EFFECT_LABELS/PERCENT_KEYS）、`combat → realm`（realmName），已上提共享内核 `src/common/kernel/` 消除。当前 `check:deps` 全绿 |
| R5 | `story → quest`、`chapter → quest` 同源依赖 | 归入 quest 服或按 §3 层级（quest 在下）排布 |
| R6 | attach WS 与 Nest 网关冲突 | M1 删 `/ws-user`；必要时改独立端口 |
| R7 | 生产禁用 `extension-nestjs` | 生产走 Java External Server/独立逻辑服；M6 专项 |
| R8 | 依赖被打破形成环 | §4.4 CI 强制；评审对照 §3.2 |
| R9 | **开发启动器缺装饰器元数据**：`tsx`/esbuild 不产出 `design:paramtypes`，NestJS 按类型注入全部失效（全 HTTP 500，既有缺陷） | 已修：`scripts/dev.mjs` 改为 `tsc --watch` 产出 dist + `node --watch dist/main.js`；CI/验收一律跑 dist |

## 8. 工作量粗估

| 里程碑 | 预估 |
|---|---|
| M0 | 0.5–1 天（含 DAG 复核 R4） |
| M1 | 2 天（通道 + 桥接 + 鉴权 + 对外服骨架 + CI 环检测） |
| M2 | 1 天 |
| M3 | 6–9 天（按新服数，比按旧模块更多） |
| M4 | 1 天 |
| M5 | 1–2 天 |
| M6 | 独立排期 |

---

## 附：证据索引
- 外部服务关闭：`packages/server/src/app.module.ts:25-30`
- 游戏交互全 REST：`packages/server/src/modules/game/**/*.controller.ts`
- 现服务依赖关系（§3 映射依据）：各 `*.service.ts` 的 `constructor`
- Action 无 DI：`vendor/ionet-ts/packages/core-framework/src/core/bar-skeleton.ts:44-49`
- WS 丢 headers / 无鉴权：`vendor/ionet-ts/packages/external-server/src/websocket/ws-server.ts:138-161`
- 框架加固清单：`ai-docs/frontend-solution-exploration/05-框架作者视角的协议加固清单.md`
- WS 契约：`ai-docs/ws-protocol-contract.md`
- 依赖/环检查：`packages/server/scripts/check-deps.mts`（`pnpm run check:deps`）
- dev 启动器（元数据修复）：`packages/server/scripts/dev.mjs`
- WS 冒烟：`packages/server/scripts/ws-smoke.mts`（`pnpm run smoke:ws`）
