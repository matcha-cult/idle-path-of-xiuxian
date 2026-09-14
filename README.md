# 放置·修仙之路

基于 **ionet-ts + NestJS** 的官方示例项目。

## 项目说明

- 当前项目名称：放置·修仙之路
- 技术栈：TypeScript、NestJS、ionet-ts、PostgreSQL
- 所有参考项目仅作参考，不作为当前项目业务逻辑指引
- 当前项目是 ionet-ts 官方示例

## 目录结构

```
idle-path-of-xiuxian/
├── packages/server/          # NestJS + ionet-ts Server
├── vendor/ionet-ts/          # 本地 vendor 的 ionet-ts workspace（官方示例依赖）
└── ai-docs/                  # 规划与设计文档
```

## 快速开始

```bash
pnpm install --store-dir /tmp/pnpm-store

# 复制环境变量并配置两个数据库连接串（.env → .env.example）
cp packages/server/.env.example packages/server/.env

# 初始化用户系统表（users / characters）
pnpm --filter idle-path-server db:init

# 初始化 Game 系统表与种子（物品基底/词缀/底材词缀池/拾取规则，P1）
# 用户系统与 Game 游戏系统共用统一库（DATABASE_URL → idle_game）
pnpm --filter idle-path-server db:init:game

# 启动 Server
pnpm --filter idle-path-server dev
```

详细说明见 `packages/server/README.md`。

## ⚠️ 已知临时方案（改动前必读）

| 标记名 | 范围 | 终态方向 | 权威说明 |
| --- | --- | --- | --- |
| `TEMPORARY-OFFLINE-IDLE` | 挂机 = **离线时间 × 效率 → 一次结算**（`idle.settle`）；含按层均分的 A3 与 B2 自动结算 | **战斗逻辑服**在服务端**实时**推进挂机战斗（组队开战后无法保证队员全程在线） | `ai-docs/frontend-solution-exploration/23-挂机开发交接.md` §0.1 |

**已由用户按「临时方案」验收**（2026-09-15：「符合最低预期」）—— 即：**不要在这条链路上做长期架构级投入**，
也**不要**把它当终态去加码；其可复用部分（挂机点选择、在线/离线互斥）见该文档 §0.1 的「不属于临时方案」。

标记是**机器可校验**的：登记表在 `packages/server/test/temporary-offline-idle.test.ts`，
它断言「全仓带该标记的文件集合 == 登记表 == 文档 §0.1 的清单」（双向防漂移）；
终态落地时的收尾清单见 §0.1「退出条件」。
