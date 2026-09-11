# P1 交付报告 — 物品与词缀系统

> 交付日期：2025-09-11
> 依据：`ai-docs/v2/xiuxian-design-v2.md`、`p1-implementation-plan.md`、`p1-seed-spec.md`、`p1-api-contract.md`
> 验证方式：typecheck + build + 空库实跑 + HTTP 全链路冒烟

---

## 1. 交付物清单

### 数据层

| 文件 | 说明 |
| --- | --- |
| `packages/server/prisma/game.schema.prisma` | game 库设计工件（P1 建 6 张表） |
| `packages/server/prisma/seeds/game/item-bases.json` | 42 件基底（14 境 × 3，含 1 件传奇基底） |
| `packages/server/prisma/seeds/game/affixes.json` | 175 条词缀（12 族 × 14 阶可 roll + 4 基底 + 3 传奇固定） |
| `packages/server/prisma/seeds/game/base-affix-pools.json` | 3 池组 + 传奇额外挂载 |
| `packages/server/prisma/seeds/game/pickup-rules.json` | 1 条系统预置规则 |
| `packages/server/scripts/init-game-db.mjs` | 建表 DDL + 幂等种子重灌（族 → 14 阶展开共 3727 池行） |

### 服务层（新增 `src/modules/game/`）

| 文件 | 说明 |
| --- | --- |
| `game-database.service.ts` | 独立 pg 连接（`GAME_SERVICE_DATABASE_URL`）+ `withTransaction` 事务包装 |
| `game.module.ts` | @Global 根模块 |
| `item/item.types.ts` | 稀有度/效果键/槽位常量与共享类型 |
| `item/item.affix.service.ts` | 生成算法：−N 窗口、族去重加权抽样、稀有度词条数分配、渲染 |
| `item/item.service.ts` | 背包/详情/装备/卸下/丢弃/装备栏/基底库/辨宝法阵 CRUD |
| `item/item.controller.ts` | 12 个 HTTP 路由 |
| `item/item.module.ts` | 模块接线 |

### 改造点

| 文件 | 改动 |
| --- | --- |
| `prisma/schema.prisma`、`scripts/init-db.mjs` | characters 增 `realm`（默认 1）、`lingyun`（默认 0）；`silver` 标注弃用（ALTER 幂等补列） |
| `src/modules/character/character.service.ts` | Character 增 realm/lingyun；`findByUserId` private → public |
| `src/app.module.ts` | 挂载 GameModule |
| `.env` / `.env.example` | 增 `GAME_SERVICE_DATABASE_URL`、`AFFIX_TIER_WINDOW=4` |
| `package.json` | 增 `db:init:game`；README 快速开始补步骤 |

---

## 2. 验证记录（全链路冒烟）

| 用例 | 结果 |
| --- | --- |
| `pnpm --filter idle-path-server typecheck` / `build` | ✅ 零错误 |
| `db:init`（用户库，含 ALTER 补列） | ✅ |
| `db:init:game`（空库从零） | ✅ 6 表 / 42 基底 / 175 词缀 / 3727 池行 / 1 预置规则 |
| 注册 + 创建角色 | ✅ 返回 realm=1、lingyun=0 |
| 生成：T1 底材宝品 | ✅ 5 条词缀全为 T1（窗口 [1,1]），3 前 2 后，数值 ∈ 系数区间 |
| 生成：T14 底材宝品 | ✅ 词缀 T10~T12 ⊂ [10,14]；基底「合道」渲染 +5% |
| 生成：T14 传奇 | ✅ 固定词缀渲染（沉大道/破魔/我命 + 合道基底），无 roll |
| 装备 T1 武器 | ✅ 落 weapon 槽 |
| 装备 T2 物品（境界 1） | ✅ 拒绝：`TIER_TOO_HIGH`（当前境界 1，无法装备 T2 物品） |
| 戒指槽位 | ✅ 依次 ring1 → ring2，第三枚 `SLOT_OCCUPIED` |
| 装备栏视图 | ✅ slots + equippedCount |
| 卸下 / 丢弃（物理删除） | ✅ |
| inventory 过滤 + 分页 + 详情 | ✅ |
| pickup-rules CRUD | ✅ POST/GET/PUT/DELETE；PUT 为部分更新（未传字段保留原值） |
| 归属校验 | ✅ 他人/无主物品 → `ITEM_NOT_OWNED` |

---

## 3. 与计划文档的偏差（决策记录）

| 计划原述 | 实际落地 | 原因 |
| --- | --- | --- |
| Game 库运行时用独立 PrismaClient | 用原生 `pg` Pool + 事务包装 | 与既有用户库 DatabaseService 一致；`@prisma/client` 未安装，schema.prisma 在本项目是设计工件 |
| 词缀条目 JSON `[{affixId,value,polarity}]` | 追加 `key` 字段 `[{affixId,value,polarity,key}]` | 渲染需知道 roll 值落在哪个效果键；key=null 表示基底/固定词缀 |
| 契约列 HTTP 404/403/409 | 沿用项目风格统一 HTTP 200 + `{success:false, data.code}` | 与 Auth/Character 现有接口风格一致，不做风格分裂 |
| 拾取规则 PUT「同 POST」 | 部分更新（仅覆盖传入字段） | 契约「可部分字段」的合理解释；冒烟已验证 |
| 灵品词条数 1~2「前≤1 后≤1」 | 总=2 固定 1 前 1 后；总=1 随机一侧 | 计划 §5.6 分配规则的自然实现 |

> 以上均已回写代码注释；如需严格 PRD 一致可再改回，但建议保留（见计划文档 §8 风险回退原则）。

---

## 4. 本机开发环境引导（无 Docker 场景）

本沙箱无 Docker、无 PG 服务端（仅 client-18）。已按以下方式搭建 workspace 本地集群（`.devdb/` 已加入 .gitignore，不入库）：

1. `apt-get download postgresql-18 libicu78 libnuma1 liburing2` → `dpkg -x` 到 `.devdb/pgroot`
2. `LD_LIBRARY_PATH=.devdb/pgroot/usr/lib/x86_64-linux-gnu initdb -D .devdb/pgdata -U postgres --auth=trust`
3. 后台驻留 postgres（port 5432），createdb 两个库后执行 `db:init` 与 `db:init:game`

生产/常规开发环境仍以标准 PostgreSQL 服务器为准（连接串走 .env）。

---

## 5. 遗留与下一步

| 项 | 归属 |
| --- | --- |
| 品质（0~20）、通货洗炼（混沌/崇高/剥离/神圣/祝福等）、天定词缀 | P3 |
| 炼器炉/丹炉操作入口 | P3 |
| 掉落表实际执行、辨宝法阵筛选执行（现仅 CRUD 落库） | P4 |
| 单位（境界模板 + 隐藏词条 + 种子） | P4 |
| 功法 9 槽（4 心法 1 主 3 辅 + 5 术法）、道基协同、神识预算 | P2 |
| 任务逻辑服 + 剧情 5 章种子 | P6/P7 |
| characters.realm 无修改 API（境界突破入口） | P2 随突破机制 |

---

## 6. 增补（2025-09-11 晚）：数据库形态变更 — 单库合并

用户决策：**不再使用「用户库 + game 库」双库形态**，合并为单库。

| 项 | 变更前 | 变更后 |
| --- | --- | --- |
| 数据库 | idle_path_of_xiuxian_user + idle_path_of_xiuxian_game（双库） | **idle_game（单库）**，用户环境端口 35432 |
| Prisma 工件 | schema.prisma + game.schema.prisma（两份） | **合并为 schema.prisma 一份**（users/characters + 6 张 game 表），game.schema.prisma 已删除 |
| 连接配置 | USER_SERVICE_DATABASE_URL / GAME_SERVICE_DATABASE_URL | **DATABASE_URL**（由 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME 拼装，env 均提供） |
| 运行时代码 | DatabaseService / GameDatabaseService 各自 env | 均读 DATABASE_URL，fallback 由 DB_* 片段拼装 |
| 初始化 | db:init（用户）+ db:init:game（game 双库目标） | 同一 DATABASE_URL，两脚本共同作用于 idle_game，幂等 |
| 运行时 .env 加载 | main.ts 未加载 dotenv（此前冒烟靠 5432 默认串巧合通过） | **main.ts 增加 import 'dotenv/config'**（已修复） |

重新验证（用户 PostgreSQL 16.13 @ localhost:35432 / idle_game）：

- db:init + db:init:game 实跑：users/characters 就位；6 张 game 表 + 42 基底 + 175 词缀 + 3727 池行 + 1 预置规则
- 冒烟：注册/建角（realm=1、lingyun=0）/生成 T2 宝品（词缀 T1~T2）/inventory/equipment 视图/TIER_TOO_HIGH 全部通过
- psql 直连 35432 确认数据落库：users=1、characters=1、bases=42、affixes=175、pools=3727、items=1

临时引导集群（.devdb/，上节 §4）已停止并保留于 .gitignore，可随时删除。

