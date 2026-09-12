# idle-path-server

放置·修仙之路后端 Server。

## 技术栈

- NestJS（HTTP API 全部 NestJS 风格）
- ionet-ts（官方示例集成，仅注册 HealthAction，不启用 ionet-ts HTTP/WS 外部服务）
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

# 初始化 Game 系统表与种子（19 表：物品基底/词缀/池、功法、通货/精华、单位模板/隐藏词条/掉落表、离线计数、拾取规则）
# 注意：重复执行会重灌配置种子（显式 id，无漂移），不清理玩家物品与自建拾取规则
pnpm --filter idle-path-server db:init:game

# 开发
pnpm --filter idle-path-server dev

# 构建 / 类型检查
pnpm --filter idle-path-server build
pnpm --filter idle-path-server typecheck
```

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

## HTTP 接口

| 方法 | 路径 | 说明 | 认证 |
| --- | --- | --- | --- |
| POST | /api/auth/register | 注册 | 公开 |
| POST | /api/auth/login | 登录 | 公开 |
| GET | /api/character/check | 检查角色 | JWT |
| POST | /api/character/create | 创建角色（数量上限见配置） | JWT |
| GET | /api/character/info | 获取角色信息 | JWT |
| GET | /api/game/inventory | 背包列表（筛选+分页） | JWT |
| GET | /api/game/inventory/:id | 物品详情 | JWT |
| POST | /api/game/item/equip | 装备 | JWT |
| POST | /api/game/item/unequip | 卸下 | JWT |
| POST | /api/game/item/discard | 丢弃 | JWT |
| GET | /api/game/equipment | 当前装备栏 | JWT |
| GET | /api/game/item/bases | 物品基底库 | JWT |
| POST | /api/game/item/generate | 生成物品（开发/测试：生产禁用、仅限本人角色、限流） | JWT |
| GET | /api/game/skills | 功法图鉴（修习状态/等级/效果文本） | JWT |
| POST | /api/game/skill/learn | 修习功法（消耗 1 枚未开光玉简，永久入册） | JWT |
| GET | /api/game/skill/panel | 功法面板（9 槽 + 神识 + 协同标记） | JWT |
| PUT | /api/game/skill/panel | 装槽/换装（1 主 3 辅 + 5 术法，免费） | JWT |
| POST | /api/game/skill/enlighten | 参悟升级（消耗灵韵） | JWT |
| GET | /api/game/breakthrough | 境界状态与下一境消耗 | JWT |
| GET | /api/game/currencies | 通货图鉴（13 种 + 持有量） | JWT |
| POST | /api/game/currency/grant | 开发注入通货（生产禁用、限流） | JWT |
| POST | /api/game/item/craft | 炼器十四操作（蜕变/点金/混沌/崇高/剥离/重铸/神圣/祝福/映道/瓦尔/破溃/古灵余烬/古灵溶液/精华） | JWT |
| GET | /api/game/essences | 精华图鉴（6 种定向 + 持有量） | JWT |
| POST | /api/game/essence/grant | 开发发放精华（生产禁用、限流） | JWT |
| POST | /api/game/breakthrough | 突破（消耗灵韵必定成功，14 境封顶） | JWT |
| POST | /api/game/lingyun/grant | 开发注入灵韵（生产禁用、限流） | JWT |
| POST | /api/game/skill/jade-grant | 开发发放玉简（生产禁用、限流） | JWT |
| GET | /api/game/units | 单位图鉴（境界/阵营/灵韵/掉落表/隐藏词条池） | JWT |
| GET | /api/game/drop-tables | 掉落表图鉴（9 表 / 126 条目） | JWT |
| POST | /api/game/unit/spawn | 单位即时实例化（开发：生产禁用、限流） | JWT |
| POST | /api/game/unit/kill | 击杀结算 + 辨宝法阵执行（开发：生产禁用、限流） | JWT |
| GET | /api/game/idle/status | 离线收益状态（待结算时长/预计击杀/今日物品计数） | JWT |
| POST | /api/game/idle/settle | 离线结算（hours 覆盖仅开发环境） | JWT |
| GET/POST | /api/health | 健康检测（DB+Redis，容器监控探针） | 公开 |

详细的 Game 接口契约见仓库 `ai-docs/v2/`：`p1/p1-api-contract.md`、`p2/p2-api-contract.md`、`p3-api-contract.md`、`p4-api-contract.md`、`p4.2-api-contract.md`。

## WS 入口

- 路径：`/ws-user`
- 由 NestJS 侧预留，仅做连接接入/握手。
- ionet-ts 侧 WS 接口不调整。

## 参考项目说明

- 所有参考项目仅作参考，不作为当前项目业务逻辑指引。
- `idle-matcha` 为已上线项目改进版，已终止开发（废案）。
- `stock-market-service` 为参考实现废案。
- 当前项目使用新建数据库，不继承任何参考项目/废案数据库。
