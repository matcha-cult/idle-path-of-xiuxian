# idle-path-server

放置·修仙之路后端 Server。

## 技术栈

- NestJS（HTTP API 全部 NestJS 风格）
- ionet-ts（外部服 attach 到 NestJS 同一 http.Server 的 `/ws`；Action 经 NestJS DI 桥接注册）
- PostgreSQL（用户系统 + Game 游戏系统共用统一库，连接串见 .env 的 DATABASE_URL）
- Redis（健康检测探测用，REDIS_URL）

## 快速开始

```bash
# 安装依赖（仓库根目录）
pnpm install --store-dir /tmp/pnpm-store

# 复制环境变量并按需修改（DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME）
cp .env.example .env

# 初始化用户系统表（users / characters）
pnpm --filter idle-path-server db:init

# 初始化 Game 系统表与种子（28 表：物品基底/词缀/池、功法、通货/精华、单位模板/隐藏词条/掉落表、秘境/进度/状态、离线计数、任务定义/进度、章节定义/进度、事件计数、演出已读、拾取规则）
# 注意：重复执行会重灌配置种子（显式 id，无漂移），不清理玩家物品与自建拾取规则
pnpm --filter idle-path-server db:init:game

# 开发（tsc --watch 产出 dist + node --watch 运行 dist）
# 注意：不要用 tsx 直接跑 src——esbuild 不产出装饰器元数据，NestJS 按类型注入会全部失效
pnpm --filter idle-path-server dev

# 构建 / 类型检查
pnpm --filter idle-path-server build
pnpm --filter idle-path-server typecheck

# 逻辑服依赖 / 环检查（DAG 门禁）
pnpm --filter idle-path-server check:deps

# 一键校验（typecheck + 测试类型检查 + 依赖检查 + 单元测试）
pnpm --filter idle-path-server verify

# 单元边界测试（node:test + tsx；不需要 DB/Redis/网络）
pnpm --filter idle-path-server test:unit

# 测试代码类型检查
pnpm --filter idle-path-server typecheck:test

# WS 冒烟（需先启动服务；默认连 ws://127.0.0.1:${PORT:-3000}/ws）
pnpm --filter idle-path-server smoke:ws

# idle 逻辑服端到端：注册 → 建角 → 带 token 调用 (130,1) → 无 token 被拦截
pnpm --filter idle-path-server e2e:idle

# 全逻辑服冒烟：16 只读 Action + 生成/穿戴/卸下/丢弃写入链路 + 鉴权拦截
pnpm --filter idle-path-server e2e:all

# M5 端到端旅程：注册→登录→建角→背包→装备→突破→秘境→任务→断线重连
pnpm --filter idle-path-server e2e:journey
```

WS 参考客户端实现见 `scripts/sdk/ws-client.ts`（串行队列 + 应用层心跳 + 自动重连重新取 token），
前端可直接复用该实现接入 `/ws`。

## 逻辑服目录结构

每个逻辑服的实现都在自己的目录内，跨服只能经**门面**与**公开类型出口**：

```
src/modules/logic/<server>/
  <server>.action.ts          # @ActionController(cmd) + @ActionMethod，只做鉴权/参数解析/转交
  <server>.logic.service.ts   # 门面：本服唯一出口，上层只允许调用它
  <server>.api.ts             # 公开类型/常量（跨服引用类型的唯一入口，部分服适用）
  <server>-logic.module.ts    # Nest 模块：组装内部实现 + 导出 Action
  internal/                   # 实现细节（服务/类型/内部模块），跨服禁止直接 import
```

`modules/game/` 仅保留基础设施：`game-database.service.ts`、`stat/`、`game.module.ts`（GameDatabaseService + RateLimiterService）。

依赖约束由 `pnpm run check:deps` 静态强制：全图无环、低层不依赖高层、禁止跨服直连 `internal/`。

## 生产部署（R7）

框架 `@nbb-ionet/extension-nestjs` 默认在 `NODE_ENV=production` 下**拒绝启动**（`IonetModule.forRoot` 直接抛错）。
框架侧已支持显式放行，本服务接入为环境变量：

```bash
# 自管 Node 生产进程时显式放行；不设置则保持「生产禁用」
IONET_ALLOW_PRODUCTION=true NODE_ENV=production node dist/main.js
```

> 未显式设置 `IONET_ALLOW_PRODUCTION=true` 时，生产环境启动仍会被框架拦截。
> 若按框架设计改走 Java External Server + 独立逻辑服进程，则无需该变量。

## 配置文件（config/app.config.json）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| maxCharactersPerAccount | 1 | 单账户最大角色数 |
| devToolRateLimitPerMinute | 5 | 开发工具（物品生成/单位 spawn 与 kill/灵韵与玉简/通货与精华注入）共享的单账户每分钟调用上限 |
| spiritBudget | 100 | 辅心法共享神识总预算 |
| maxSkillLevel | 20 | 功法参悟等级上限 |
| enlightenBaseCost | 100 | 参悟基础消耗（总消耗 = enlightenBaseCost × 当前等级） |
| synergyBonusPct | 20 | 主心法道基一致术法的协同加成（占位展示） |
| realmBreakthroughCosts | 200×n² 表 | 境界突破消耗：index=当前境界→升下一境消耗（0 占位，14 封顶） |
| unitRealmBase | 5 属性 growth 表 | 境界模板基础属性：value = round(base × growth^(realm−1))（P4 单位） |
| unitHiddenAffixCount | [1,3] | 单位实例化 roll 的隐藏词条条数区间（P4） |
| lootFallbackAction | salvage | 辨宝法阵无规则命中时的回退动作（keep/salvage/sell/discard，P4） |
| lootSalvageLingyunPerTier | 2 | 分解返还灵韵 = tier × perTier × (rarity+1)（P4） |
| lootSellSpiritStonesPerTier | 10 | 出售返还灵石 = tier × perTier × (rarity+1)（P4） |
| maxKillsPerRequest | 50 | 单次击杀结算的最大击杀数（P4） |
| idleRoundsPerHour | 60 | 离线收益每小时结算轮数（P4.2） |
| idleEfficiencyPct | 60 | 离线收益效率百分比（设计 §9.2）（P4.2） |
| idleMaxOfflineHours | 12 | 可累计离线上限小时（设计 §9.2）（P4.2） |
| idleDailyItemCap | 200 | 每日物品产出上限件数（设计 §9.2）（P4.2） |
| zonePower | {realm:20, equip:5, skillDiv:2} | 秘境战力权重：realm×w + 装备数×w + floor(功法等级和/div)（P5.1） |
| zoneBossExtraDraws | 2 | 秘境 Boss 层额外掉落判定次数（P5.2） |

## HTTP 接口

> **通道规划已落地**：注册/登录/角色/健康走 HTTP；**其余游戏交互全部走 WS `/ws`**。
> 旧 REST 游戏接口已在 M4 全部删除（404）；游戏能力见下方「WS Action 表」。

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| POST | /api/auth/register | 注册 | 公开 |
| POST | /api/auth/login | 登录 | 公开 |
| GET | /api/character/check | 检查角色 | JWT |
| POST | /api/character/create | 创建角色（数量上限见配置） | JWT |
| GET | /api/character/info | 获取角色信息 | JWT |
| GET/POST | /api/health | 健康检测（DB+Redis，容器监控探针） | 公开 |

历史 Game REST 契约见仓库 `ai-docs/v2/`（`p1`…`p7.2`）；当前生效的接口契约为 WS 版：`ai-docs/ws-protocol-contract.md`。

## WS 通道（ionet 外部服）

- 路径：`/ws`，与 HTTP **同端口**（attach 到 NestJS `http.Server`）。
- 请求：`{ cmd, subCmd, data }`；响应：`{ data?, errorCode?, errorMessage? }`。
- 鉴权（v1）：受保护 Action 需在 `data.__token` 携带 JWT；白名单见 `src/ionet/cmd.ts` 的 `PUBLIC_ACTION_KEYS`。
- 路由表：`src/ionet/cmd.ts`（每逻辑服一个 cmd 段）；Action 经 `GameActionBridgeModule` 以 DI 实例注册进 `BarSkeleton`。
- 对外服：`src/modules/edge` 实现 `NotificationPort`（广播/通知/推送），逻辑服只依赖 `src/common/ports/notification.port.ts`。
- 完整契约见 `ai-docs/ws-protocol-contract.md`。

### WS Action 表（已实现）

| cmd | 逻辑服 | subCmd → Action |
| --- | --- | --- |
| 1 | system | 1 ping（免鉴权） |
| 30 | item | 1 inventory · 2 inventoryDetail · 3 bases · 4 pickupRuleList · 5 pickupRuleCreate · 6 pickupRuleUpdate · 7 pickupRuleDelete |
| 40 | prop | 1 discard · 2 generate（dev） |
| 50 | equip | 1 equip · 2 unequip · 3 equipment |
| 60 | skill | 1 list · 2 learn · 3 panel · 4 panelUpdate · 5 enlighten · 6 lingyunGrant（dev） · 7 jadeGrant（dev） |
| 70 | economy | 1 currencies · 2 currencyGrant（dev） · 3 craft · 4 essences · 5 essenceGrant（dev） |
| 80 | realm | 1 breakthroughInfo · 2 breakthrough |
| 90 | combat | 1 units · 2 dropTables · 3 spawn（dev） · 4 kill（dev） |
| 100 | zone | 1 zones · 2 progress · 3 enter · 4 challenge |
| 110 | quest | 1 list · 2 detail · 3 sync · 4 chapterList · 5 chapterDetail · 6 chapterSync |
| 120 | story | 1 chapter · 2 quest · 3 seen |
| 130 | idle | 1 status · 2 settle |

依赖图（边方向上层→下层，禁止环）：

```
idle(L4)
  └─ quest(L3) ─ story(L3)
       └─ zone(L2)
            └─ combat · realm · economy(L1)
                 └─ prop · equip · skill(L0)
                      └─ item · character(L-1)
```

> 依赖由 `pnpm run check:deps` 静态强制；越层/成环即 CI 失败。

## 参考项目说明

- 所有参考项目仅作参考，不作为当前项目业务逻辑指引。
- `idle-matcha` 为已上线项目改进版，已终止开发（废案）。
- `stock-market-service` 为参考实现废案。
- 当前项目使用新建数据库，不继承任何参考项目/废案数据库。
