# P1 执行篇 — 物品与词缀系统收尾记录

> 文档性质：P1 全生命周期的正式执行记录（设计修订 → 规划文档 → 编码 → 基础设施收敛 → 审阅修正）
> 关联文档：`../xiuxian-design-v2.md`、`p1-implementation-plan.md`、`p1-seed-spec.md`、`p1-api-contract.md`、`p1-delivery-report.md`、`p1-code-review.md`
> 收尾日期：2025-09-12

---

## 1. 时间线

| 阶段 | 内容 | 产物 |
| --- | --- | --- |
| 1. 设定修订 | 7 条大方向修订（R1-1~R1-7：无等级仅境界、单位体系、5 章剧情+任务服、货币定位、T 阶反转、底材等阶与 roll 窗口、取消阴阳铭文） | 全新 v2 设计文档 |
| 2. 决策澄清 | −4 窗口可配置（默认 4）、T 阶显示由前端决定、Boss 跨阶掉落走种子、传奇无 T 阶、突破消耗走种子、铭文 Text 存 JSON 串、单库 env 配置 | v2 文档修订 |
| 3. P1 规划 | 9 步实施计划 + 种子规格 + API 契约（12 接口） | ai-docs/v2/p1/ 三件套 |
| 4. P1 编码 | 六表建库、种子、生成算法、背包/装备闭环、辨宝法阵 CRUD | 全链路冒烟通过 |
| 5. 基建收敛 | 用户自有 PG（35432）+ Redis（6379）；单库 idle_game 合并 Prisma；main.ts 补 dotenv；健康检测服务 | DB 直连核验 + 探针 200 |
| 6. 代码审阅 | 外部审阅报告 H1/H2/M1-M5/L1-L5/O1-O4 | p1-code-review.md |
| 7. 审阅修正 | T1~T9 全量执行 + 回归断言 | 本文档 |

---

## 2. 关键决策记录（终态）

| # | 决策 | 终态 |
| --- | --- | --- |
| D1 | 角色成长 | 无等级，仅境界（realm 1~14）；禁止战斗中突破 |
| D2 | T 阶体系 | 数字越大越强（T1~T14，反 PoE）；底材限定窗口 `[T−N, T]`，N env 可配默认 4 |
| D3 | 命名 | 无阳铭/阴铭，统一前缀/后缀；凡品/灵品/宝品/传奇 |
| D4 | 传奇 | 无 T 阶，固定词缀，仅掉落产出 |
| D5 | 数据库 | 单库 `idle_game`（35432），合并 Prisma schema，运行时原生 pg |
| D6 | env | DATABASE_URL（+DB_* 片段）、REDIS_URL、AFFIX_TIER_WINDOW；`main.ts` 加载 dotenv |
| D7 | 通用响应 | HTTP 200 + `{success,message,data}`；错误 `data.code`；健康探针例外用 200/503 |
| D8 | 铭文存储 | 表列 Text 存 JSON 串；条目含 `{affixId,value,polarity,key}`；对外视图补 `code/name/tier` |
| D9 | generate 接口 | 仅 POST；生产禁用；仅限本人角色或 null；5 次/分钟限流（config） |
| D10 | 角色数 | 单账户上限可配（app.config.json，当前 1） |
| D11 | 丢弃 | P1 物理删除（出售/分解归 P3+） |
| D12 | 配置化 | 角色上限/限流走 app.config.json；基底/词缀/池/掉落上限全部种子驱动 |

---

## 3. 交付物总表

### 3.1 代码（src）

| 模块 | 文件 | 要点 |
| --- | --- | --- |
| game 库服务 | `modules/game/game-database.service.ts` | pg Pool + withTransaction |
| 物品域 | `modules/game/item/item.types.ts` | 常量/类型（RARITY_NAMES、EQUIP_SLOT_KEYS、EFFECT_LABELS、AffixView） |
| 物品域 | `item.affix.service.ts` | 生成算法：窗口、族去重加权抽样、词条数分配、渲染 |
| 物品域 | `item.service.ts` | 背包/详情/装备/卸下/丢弃/装备栏/基底库/规则 CRUD + generate 门禁限流 |
| 物品域 | `item.controller.ts` | 12 路由 + toFiniteInt NaN 防御 |
| 健康 | `modules/health/*`（4 文件） | DB SELECT 1 + Redis PING；200/503；@Public |
| 配置 | `common/config/app-config.ts` | config/app.config.json 加载（带默认值与告警） |
| 改造 | `character.service.ts` | realm/lingyun；角色数上限；findByUserId public |
| 改造 | `main.ts` | dotenv/config |

### 3.2 数据与脚本

| 项 | 说明 |
| --- | --- |
| `prisma/schema.prisma` | 合并工件：users/characters + game 六表（P2+ 表后续追加） |
| `prisma/seeds/game/*.json` ×4 | 42 基底（显式 id 1~42）/ 175 词缀（id 1~175）/ 池组 / 预置规则 |
| `scripts/init-db.mjs` | users/characters DDL（幂等 ALTER 补列） |
| `scripts/init-game-db.mjs` | game 六表 DDL + 种子重灌（仅重建预置模板、显式 id、序列校准、漂移告警） |
| `config/app.config.json` | maxCharactersPerAccount=1、generateRateLimitPerMinute=5 |

### 3.3 文档

`ai-docs/v2/`：设计 v2；`p1/`：实施计划、种子规格、API 契约、交付报告、代码审阅、本执行篇。

---

## 4. 验证证据（全部真实执行）

| 类别 | 断言 | 结果 |
| --- | --- | --- |
| 工程 | typecheck / build | ✅ 零错误 |
| 建库 | db:init / db:init:game 空库实跑 | ✅ 6 表 42/175/3727 |
| 窗口 | T1 底材全 T1；T14 底材 ⊂[10,14] 无低 T 垃圾 | ✅ |
| 族去重 | T5（[1,5]）×2、T10（[6,10]）×1 共 12 词缀零同族 | ✅ |
| 稀有度 | 凡 0/灵 1~2/宝 3~6/传奇固定；rarity=-1 → INVALID_PARAM | ✅ |
| 境界 | T2 对境界 1 → TIER_TOO_HIGH | ✅ |
| 槽位 | 戒指 ring1→ring2→SLOT_OCCUPIED | ✅ |
| 门禁 | GET generate 404；越权 FORBIDDEN；限流第 6 次 RATE_LIMITED | ✅ |
| 参数 | /inventory/abc、缺 itemId → INVALID_PARAM（无 500） | ✅ |
| 重灌 | 带玩家数据重灌：自建规则存活、物品引用无损、新生成正常 | ✅ |
| 配置 | 第二角色被拒（上限 1） | ✅ |
| 契约 | affixes 输出含 code/name/tier；equip message 带物品名 | ✅ |
| 健康 | /api/health GET+POST → 200（DB+Redis up） | ✅ |

---

## 5. 技术债台账（已登记，不阻塞）

| 债 | 触发线 | 状态 |
| --- | --- | --- |
| M5 inventory/池摘要 N+1 | P4 掉落量级前改批量 `ANY` | 待办 |
| L4 BIGINT→Number 精度 | P2 灵韵量级前改 string/BigInt | 待办 |
| L5 随机源统一（Math.random/crypto 混用） | 可选 | 观察 |
| O1 双 Pool 与跨服务事务 | P2 领域设计（突破/装备跨表事务）时定 | 观察 |
| O4 无外键一致性 | init 脚本漂移告警已覆盖基础面 | 部分缓解 |

---

## 6. 提交记录（本地，未推送）

```text
f8489d5 fix(p1): 代码审阅修正（H1/H2/M1-M4/L1/L2/L3/O3）
6fe84fd feat(game): P1 物品与词缀系统、单库合并与健康检测
05213af feat: ionet cmd 分段规划 + HealthAction 对齐 cmd=1（P0 基线）
```

---

## 7. P1 验收结论

满足审阅报告验收标准（H1/H2 修复后即可验收）：**P1 收尾完成**，进入 P2（功法体系）前置澄清。
