# P1 实现计划 — 物品与词缀系统

> 依据文档：`ai-docs/v2/xiuxian-design-v2.md`
> 配套文档：`p1-seed-spec.md`（种子数据规格）、`p1-api-contract.md`（API 契约）
> 状态：待评审

---

## 1. 目标与范围

**目标**：以 v2 设定为准，落地可运行的物品底层：

- 独立 game 数据库（env 配置连接串）
- 物品基底 / 词缀 / 底材词缀池三张配置表 + 种子数据
- 物品实例生成器（含 −N roll 窗口、前后缀、稀有度词条数规则）
- 背包 / 装备 / 卸下 / 丢弃 / 装备栏 API
- typecheck + build + 建库实跑 + API 冒烟通过

**非目标**（明确不做）：功法、通货洗炼动作、炼丹、单位、任务、掉落结算、离线收益、辨宝法阵规则引擎（仅表结构 + CRUD 落库）。

---

## 2. 前置决策（已定，勿再变更）

| 决策 | 结论 |
| --- | --- |
| 数据库形态 | 独立 game 库，连接串走 env |
| env 变量 | `GAME_SERVICE_DATABASE_URL` |
| 铭文存储 | 表列定义为字符串（Text），应用层存 JSON 字符串 |
| roll 窗口 | `[底材T − N, 底材T]`，N 可配置，默认 4，env：`AFFIX_TIER_WINDOW` |
| 底材/词缀 T 阶 | T1~T14，数字越大越强；底材 T 阶 ↔ 境界序号 1:1 |
| 传奇 | 无 T 阶（固定词缀，tier=0），不参与 roll |
| 突破消耗 | P1 不涉及（P2+），仅预留 characters 字段 |
| 命名 | 无「阳铭/阴铭」，统一 前缀/后缀 |

---

## 3. 环境与配置

| env 变量 | 默认 | 说明 |
| --- | --- | --- |
| `GAME_SERVICE_DATABASE_URL` | 无 | game 库连接串，必填 |
| `AFFIX_TIER_WINDOW` | `4` | roll 词缀窗口 N（整数 ≥0） |

.env / .env.example 同步新增，README 记录。

---

## 4. 实施步骤

| 步骤 | 产出 | 依赖 |
| --- | --- | --- |
| 1 | 用户库 characters 扩展：`realm`、`lingyun`；`silver` 标记弃用 | — |
| 2 | `packages/server/prisma/game.schema.prisma`（P1 建 6 张表） | 步骤 1 |
| 3 | `packages/server/scripts/init-game-db.mjs` + 建库说明 + `db:init:game` 脚本 | 步骤 2 |
| 4 | 种子数据文件（见 p1-seed-spec.md） | 步骤 3 |
| 5 | `src/modules/game/game-database.service.ts`（独立 PrismaClient + 事务包装） | 步骤 2 |
| 6 | `src/modules/game/item/item.affix.service.ts`（roll 算法） | 步骤 4、5 |
| 7 | `src/modules/game/item/item.service.ts`（背包/装备/丢弃/装备栏） | 步骤 5、6 |
| 8 | `src/modules/game/item/item.controller.ts` + module + app.module 接线 | 步骤 7 |
| 9 | 验证：typecheck、build、init 实跑、API 冒烟 | 全部 |

---

## 5. 步骤细则

### 5.1 步骤 1 — characters 表扩展

在用户库 schema（`packages/server/prisma/schema.prisma`）中：

- 新增 `realm Int @default(1) @db.SmallInt`——当前境界序号 1~14
- 新增 `lingyun BigInt @default(0)`——灵韵（角色绑定）
- `silver BigInt @default(0)`——注释改为「（弃用）银两，不再使用」

迁移：对用户库执行一次 migration（仅开发环境数据重建可行时直接 `db push`）。

### 5.2 步骤 2 — game.schema.prisma（P1 建 6 张表）

只建 P1 用到的表，避免未实现表停机。表清单与字段规格：

| 表 | 用途 | 说明 |
| --- | --- | --- |
| `game_item_bases` | 物品基底 | tier、base_stats、implicit_affixes、unique_affixes、rarity_limit |
| `game_affixes` | 词缀池 | polarity(prefix/suffix/base)、tier、effects、value_func、weight、is_fractured |
| `game_base_affix_pools` | 底材词缀池 | 每种底材的前缀/后缀池挂载 |
| `game_items` | 物品实例 | **affixes 为字符串列（Text），存 JSON 字符串** |
| `game_equipment` | 装备栏 | character_id 唯一，slots 为字符串列存 JSON 字符串 |
| `game_pickup_rules` | 辨宝法阵规则 | P1 仅 CRUD 落库，不执行筛选 |

字段一律沿用 v2 §11 定义 + 本计划修正，要点：

- `game_affixes.tier`：1~14 为可 roll 词缀；0 表示「无 T 阶」（基底词缀/传奇固定词缀）。
- `game_items.affixes`：**Text 列**，格式 `[{"affix_id":1,"value":15,"polarity":"prefix"}, ...]`，应用层 JSON.stringify / parse。
- `game_equipment.slots`：**Text 列**，格式 `{"weapon":123,"body":null,...}`。
- `game_pickup_rules`：rarity_min、tier_min、affix_codes（Text/JSON 字符串）、action(keep/salvage/discard)、enabled、priority。

> 与 v2 §11 的差异说明：v2 中 items.affixes 与 equipment.slots 曾标 Json，现按已定决策统一为字符串列存 JSON 字符串。

### 5.3 步骤 3 — 建库与初始化脚本

- `init-game-db.mjs`：按 `GAME_SERVICE_DATABASE_URL` 执行建表与 seed 导入；幂等（重复执行可重建 seed 配置表）。
- package.json 新增脚本 `db:init:game`。
- 建库说明写入 README（CREATE DATABASE 需人工/运维执行，脚本只建表）。

### 5.4 步骤 4 — 种子数据

数据规格见 `p1-seed-spec.md`。seed 文件以 JSON 形式存放于
`packages/server/prisma/seeds/game/`：

| 文件 | 内容 |
| --- | --- |
| `item-bases.json` | 42+ 条基底（14 境 × 每境 ≥3 件） |
| `affixes.json` | 12 条可 roll 词缀 + 基底词缀 + 传奇固定词缀 |
| `base-affix-pools.json` | 池挂载（按池组展开为具体行） |
| `pickup-rules.json` | 1 条预置默认规则 |

### 5.5 步骤 5 — GameDatabaseService

- 独立 PrismaClient，连接串读 `GAME_SERVICE_DATABASE_URL`。
- 提供事务包装方法，供物品生成（写入 item + 关联更新）使用。
- 全局导出 GameModule，供给 ItemModule。

### 5.6 步骤 6 — item.affix.service（核心算法）

**物品生成流程（规格）**：

1. 校验 baseId 存在；目标稀有度 ≤ 基底 `rarity_limit`，超限报 RARITY_EXCEEDS_LIMIT。
2. 稀有度 → 词条数：
   - 凡品(0)：0 条
   - 灵品(1)：1~2 条（前缀 ≤1、后缀 ≤1）
   - 宝品(2)：3~6 条（前缀 ≤3、后缀 ≤3）
   - 传奇(3)：不 roll；词缀 = 基底 `unique_affixes`（fixed 列表）+ 基底词缀
3. 计算窗口：`tMax = baseTier`，`tMin = max(1, baseTier − N)`，N 读 `AFFIX_TIER_WINDOW`。
4. 前缀条数 = 目标总条数中按规则分配（先定前后缀各自数量，再分别抽取）。
5. 词缀池 = 该底材在 `game_base_affix_pools` 中挂载的对应极性词缀；过滤 `tier ∈ [tMin, tMax]`、`is_fractured = false`。
6. 按 `weight` 加权不放回抽取，同一 affix code 不重复出现。
7. 数值 roll：按种子文件中每个词缀的 `valueFunc`（线性 min/max 系数 × tier）在 [min, max] 内均匀取整（百分比字段保留 1 位小数）。
8. 基底词缀：从基底 `implicit_affixes` 模板直接复制（不做 roll）。
9. 结果序列化为 JSON 字符串写入 `game_items.affixes`。

**渲染规格**：由 service 输出 `affixTexts` 数组，示例格式：
```
"锋锐 T5：攻击 +15"        （prefix 的渲染形态）
```
渲染文本只取决于数据：名称、tier（>0 才显示 T 段）、效果键中文名与数值。前后缀不显示「前缀/后缀」字样，靠上下分区呈现（前端决定）。

### 5.7 步骤 7 — item.service

| 功能 | 规则要点 |
| --- | --- |
| 背包列表 | 按 character_id 查询；筛选 category/rarity/tier 区间、分页 |
| 物品详情 | 解析 affixes 字符串 → 渲染 affixTexts |
| 装备 | 校验归属、tier ≤ 角色 realm（境界）、状态 bag、槽位未占用；写入 equipment.slots；item.status=equipped |
| 卸下 | 校验已装备；从 slots 移除；status 回 bag |
| 丢弃 | 校验归属；计数类型逻辑（P1 装备类均为单件）；status 改 discarded 或直接物理删除（**P1 采用物理删除**，出售/分解属 P3+） |
| 装备栏 | 读 slots 并渲染轻量条目（id/name/rarity/tier） |
| 生成 | 仅开发/测试用途，调 affix.service |

**跨库依赖**：`CharacterService.findByUserId` 由 private 改 public，供物品服务由 userId 解析 character_id（P1 不引入角色 RPC，直接复用现有 user 库连接）。

### 5.8 步骤 8 — Controller / Module 接线

- 路由前缀 `/api/game`，全部走既有 JwtAuthGuard + `@UserId()`。
- 接口清单与契约见 `p1-api-contract.md`。
- app.module.ts：imports 增加 `GameModule`。

### 5.9 步骤 9 — 验证

| 检查 | 命令 / 方式 |
| --- | --- |
| 类型检查 | `pnpm typecheck` |
| 构建 | `pnpm build` |
| 建库实跑 | `pnpm db:init:game`（空库从零成功） |
| 冒烟 | 见 p1-api-contract.md 第 6 节 curl 清单 |

---

## 6. 关键算法补充规格

- **权重默认规则**：`weight(t) = ceil(120 / t)`（T1=120 … T14=9），种子文件可按行覆盖。
- **稀有度不影响 roll 数值大小**：数值只由词缀 tier 决定；稀有度只决定词条数与是否能出现该稀有度对应的品阶（P1 生成器直接指定稀有度）。
- **天定词缀**：P1 seed 不配置任何 `is_fractured=true` 的词缀；生成器统一过滤，为 P3 洗炼预留。
- **id 分配**：game_items 用 BigInt 自增；affixes/base_id 为 Int。

---

## 7. 验收标准

- [ ] 从空 game 库执行 `db:init:game` 成功，6 张表与 seed 数据就位
- [ ] 生成 API：同一底材 20 次出来的词缀 tier 均落在 `[baseT − N, baseT]` 且前后缀不超上限
- [ ] 装备 API：T8 的境界 5 角色装备 T8 物品 → 返回 TIER_TOO_HIGH
- [ ] 背包/装备栏/卸下/丢弃 正常闭环
- [ ] typecheck + build 零错误

---

## 8. 风险与回退

| 风险 | 应对 |
| --- | --- |
| 用户库 migration 影响现有数据 | 开发期允许重建；生产前出正式迁移脚本 |
| seed 数值量级偏差 | 全部经种子文件，改 JSON 即可，不动代码 |
| 独立库与用户库角色归属解析 | 仅经由 CharacterService 一处，出错收敛单点 |
