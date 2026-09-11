# 放置·修仙之路 — 设计→实现差距分析

> 对比基准：`ai-docs/poe-xiuxian-restyle-design.md`（616 行完整设计文档）
> 对比如下：当前代码库状态
> 生成日期：2025-07-17

---

## 1. 数据库层差距

### 当前状态

| 数据库 | Schema 文件 | 表 | 连接变量 |
| --- | --- | --- | --- |
| 用户系统 DB | `packages/server/prisma/schema.prisma` | `users`、`characters` | `USER_SERVICE_DATABASE_URL` |

### 设计需求（§5 数据模型）

| 数据库 | Schema 文件 | 表 | 连接变量 |
| --- | --- | --- | --- |
| Game DB（推荐独立） | `game.schema.prisma`（待创建） | `game_item_bases`、`game_affixes`、`game_items`、`game_equipment`、`game_skill_panels`、`game_learned_skills`、`game_pickup_rules`、`game_drop_tables` | `GAME_SERVICE_DATABASE_URL`（待定义） |

### 差距明细

| 表 | 设计状态 | 实现状态 | P1 需要 |
| --- | --- | --- | --- |
| `game_item_bases` | Schema 完整（§5，字段级） | ❌ 不存在 | ✅ 是（核心） |
| `game_affixes` | Schema 完整（§5） | ❌ 不存在 | ✅ 是（核心） |
| `game_items` | Schema 完整（§5） | ❌ 不存在 | ✅ 是（核心） |
| `game_equipment` | Schema 完整（§5） | ❌ 不存在 | ✅ 是（核心） |
| `game_skill_panels` | Schema 完整（§5） | ❌ 不存在 | ❌ 否（P2） |
| `game_learned_skills` | Schema 完整（§5） | ❌ 不存在 | ❌ 否（P2） |
| `game_pickup_rules` | Schema 完整（§5） | ❌ 不存在 | ⚠️ 表结构 P1，业务 P4 |
| `game_drop_tables` | Schema 完整（§5） | ❌ 不存在 | ⚠️ 表结构 P1，业务 P4 |

### 现有表需修改

| 表 | 字段 | 改动 | 原因 |
| --- | --- | --- | --- |
| `characters` | `spirit_stones` | 语义升级：从「便利货币」→「基本交易货币（金币位）」 | Set 12 |
| `characters` | `silver` | 标记弃用或移除 | Set 12：银两弃用 |

---

## 2. 服务/模块层差距

### 当前模块结构

```
packages/server/src/
├── main.ts
├── app.module.ts
├── common/
│   ├── decorators/
│   │   ├── public.decorator.ts
│   │   └── user-id.decorator.ts
│   └── guards/
│       └── jwt-auth.guard.ts
├── modules/
│   ├── database/
│   │   ├── database.module.ts
│   │   └── database.service.ts
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   └── auth.service.ts
│   ├── character/
│   │   ├── character.module.ts
│   │   ├── character.controller.ts
│   │   └── character.service.ts
│   └── ws/
│       ├── user-ws.module.ts
│       └── user-ws.gateway.ts
└── ionet/
    ├── cmd.ts
    └── health.action.ts
```

### 设计需求（§6 服务与 API 设计）

```
modules/game/                          ← 不存在
├── game.module.ts                     ← 不存在
└── item/
    ├── item.module.ts                 ← 不存在
    ├── item.controller.ts             ← 不存在
    ├── item.service.ts                ← 不存在
    ├── item.affix.service.ts          ← 不存在
    └── dto/
        ├── equip.dto.ts               ← 不存在
        ├── pickup-rule.dto.ts         ← 不存在
        └── generate-item.dto.ts       ← 不存在
```

### 差距：全部需要新建

---

## 3. API 接口差距

### 当前接口

| 方法 | 路径 | 模块 |
| --- | --- | --- |
| POST | `/api/auth/register` | Auth |
| POST | `/api/auth/login` | Auth |
| GET | `/api/character/check` | Character |
| POST | `/api/character/create` | Character |
| GET | `/api/character/info` | Character |

### 设计需求（§6 接口草案）

| 方法 | 路径 | P1 需要 | 状态 |
| --- | --- | --- | --- |
| GET | `/api/game/inventory` | ✅ 是 | ❌ 不存在 |
| GET | `/api/game/inventory/:id` | ✅ 是 | ❌ 不存在 |
| POST | `/api/game/item/equip` | ✅ 是 | ❌ 不存在 |
| POST | `/api/game/item/unequip` | ✅ 是 | ❌ 不存在 |
| POST | `/api/game/item/discard` | ✅ 是 | ❌ 不存在 |
| GET | `/api/game/equipment` | ✅ 是 | ❌ 不存在 |
| GET | `/api/game/item/bases` | ✅ 是 | ❌ 不存在 |
| POST | `/api/game/item/generate` | ✅ 是 | ❌ 不存在 |
| GET/POST/PUT/DELETE | `/api/game/pickup-rules` | ⚠️ 表结构 P1 | ❌ 不存在 |

**合计：P1 需新增 8 个接口。**

---

## 4. 数据/种子数据差距

### 当前状态

- 无任何物品基底数据
- 无任何铭文词缀数据
- 无掉落表配置数据
- 现有 seed：仅 users/characters 初始化逻辑（在 DatabaseService 中）

### 设计需求

| 种子数据 | 估算条目 | P1 需要 |
| --- | --- | --- |
| 物品基底（item_bases） | 30–50 条 | ✅ 是 |
| 铭文词缀（affixes） | 50–100 条 | ✅ 是 |
| 掉落表占位（drop_tables） | 少量占位 | ⚠️ 可延后 |
| 拾取规则默认值 | 1 条预置规则 | ⚠️ 可延后 |

---

## 5. 核心逻辑差距

### 5.1 物品生成器（item.affix.service.ts）

| 功能 | 设计描述 | 实现状态 |
| --- | --- | --- |
| 铭文池查询 | 按灵阶 ≤ N、类别标签匹配、按权重随机抽取 | ❌ |
| 品阶→铭文数映射 | 凡品 0 / 灵品 1~2 / 宝品 3~6 / 传奇固定 | ❌ |
| 阳铭 vs 阴铭 | 前缀阳铭、后缀阴铭，分别 roll | ❌ |
| 基底铭文 | implicit_affixes 模板 | ❌ |
| 铭文文本渲染 | 「阳铭·锋锐：攻击 +8」格式 | ❌ |

### 5.2 背包管理（item.service.ts）

| 功能 | 设计描述 | 实现状态 |
| --- | --- | --- |
| 角色归属解析 | 通过 character_id 关联 | ❌（CharacterService.findByUserId 需改 public） |
| 物品查询 | 按稀有度/大类/灵阶筛选 | ❌ |
| 装备/卸下 | 更新 game_equipment.slots JSON | ❌ |
| 丢弃 | 更新 game_items.status | ❌ |

---

## 6. 设计文档中已确认但未体现在代码中的细节

以下为设计文档中明确的规则，但尚无任何代码承载：

| 规则 | 出处 | 需要编码的位置 |
| --- | --- | --- |
| 品阶与词条数解耦 | §4.6 词条数与品阶规则 | item.affix.service.ts（生成/洗炼逻辑） |
| 物品基底 rarity_limit | §5 game_item_bases | Schema + seed |
| 铭文 pole = yang/yin/base | §5 game_affixes | Schema + seed + roll 逻辑 |
| 铭文 is_fractured 标记 | §5 game_affixes | Schema + roll 时排除 |
| game_items.affixes JSON 格式 | §5 | `[{affixId, value}]` |
| status 枚举：bag/equipped/warehouse/selling | §5 game_items | Schema + service |

---

## 7. 向 P1 迈进的行动清单

### 立即可做（不依赖待审批决策）

1. 将 `CharacterService.findByUserId` 改为 public
2. 在 `characters` 表中标注 `silver` 弃用
3. 准备物品基底名称列表（30–50 个修仙风格装备名）
4. 准备铭文名称列表（50–100 个修仙风格词缀名）
5. 编写铭文效果字段的完整 TypeScript 类型定义

### 需决策后才能做

6. 创建 game Prisma schema（依赖决策 2-1 + 2-2）
7. 创建 `GAME_SERVICE_DATABASE_URL` 环境变量（依赖决策 2-1）
8. 实现 GameDatabaseService（依赖决策 2-1）
9. 编写 init-game-db.mjs（依赖步骤 6–8）

### P1 范围内的「轻量实现」建议

由于 P1 仅需物品生成 + 背包管理（不涉及洗炼/通货/掉落），以下内容可简化：

- `game_affixes` 的 tier/spirit_grade/weight 全部用固定值（P3 神圣石再引入数值区间）
- `game_items.quality` 始终默认 0（品质属 P3）
- `game_items.affixes` 直接用 JSON 存储（决策 2-2 选 A）
- 拾取规则仅建表 + 1 条默认规则，不实现规则编辑器
- 掉落表仅建表 + 1 条占位记录，不实现掉落结算
