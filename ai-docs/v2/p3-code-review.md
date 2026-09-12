# P3 代码审阅报告 — 通货与炼器第一批（自动审阅）

> 审阅日期：2025-09-12（编码完成后自动执行）
> 审阅对象：`src/modules/game/currency/*`、`item.affix.service.ts`（炼器复用接口）、`scripts/init-game-db.mjs`、`prisma/seeds/game/currencies.json`
> 审阅方式：静态走查 + 全操作断言回归 + 并发双炼器竞态探测
> 结论：**无高/中级缺陷；P3 第一批可验收。**

---

## 一、审阅结论（走查要点）

| 维度 | 结论 |
| --- | --- |
| 事务与并发 | craft 全程同库事务（game 库）+ 物品行 FOR UPDATE + 钱包原子扣减（WHERE amount>=1）；**并发双炼器实测：恰 1 成功、后至者 RARITY_MISMATCH、通货只扣一次** ✅ |
| 操作前置校验顺序 | 行锁 → 归属/状态 → 传奇拦截 → 品阶前提 → 词缀上限 → 钱包扣减（全部校验先于扣费，失败不烧通货） ✅ |
| 词缀保全 | 基底（key=null）与天定（is_fractured）条目在所有操作中保留；annul/混沌/重铸均不触碰 ✅ |
| 随机源 | 全 crypto.randomInt（含条目数、加词方向、剥离位置） ✅ |
| 参数化 | 全 SQL 参数化；op 白名单 CRAFT_OPS ✅ |
| 复用 | rollRollableEntries / rerollEntryValues / allocCountsFor 由 P1 生成器收敛复用，未复制粘贴 roll 逻辑 ✅ |

## 二、登记（低优先级）

| 编号 | 项 | 处置 |
| --- | --- | --- |
| L1 | craft 内重组的 BaseRow 将 rarity_limit 硬编码 2（调用方场景仅 0~2，且传奇已被前置拦截） | 未来引入低稀有度上限底材时接真值 |
| L2 | divine 不保证数值必然变化（同值重 roll 概率存在，与 PoE 原型一致） | 符合原型，无需处理 |
| L3 | craft 成功 message 未带品阶名（「炼器成功：青锋剑」） | 体验优化候选 |
| L4 | 未实装 6 种通货可 grant 入钱包（图鉴已标 implemented=false，P3.2 接用途） | 符合批计划 |

## 三、验证记录

| 项 | 结果 |
| --- | --- |
| typecheck / build | ✅ 零错误 |
| 建库：11 张表（+game_currencies/game_wallets）、13 种通货种子、重灌不损钱包 | ✅ |
| transmute 凡→灵 1~2 条 | ✅ |
| alchemy 凡→宝 3~6 条 | ✅ |
| chaos 保品阶重 roll（3~6 条） | ✅ |
| exalt 宝品 → 6 条后 MAX_AFFIXES；灵品满 2 → 升宝品 3 条 | ✅ |
| annul 剥至 0 条仍灵品 → 再剥 NO_AFFIX_TO_REMOVE | ✅ |
| scour → 凡品 0 条且基底词缀（锋芒）保留 | ✅ |
| divine 词条种类不变 | ✅ |
| 传奇洗炼 → LEGENDARY_IMMUTABLE | ✅ |
| 通货不足 → NOT_ENOUGH_CURRENCY；非法 op → INVALID_OP | ✅ |
| 图鉴：13 种 + 持有量正确 | ✅ |
| 并发双炼器：恰好一次生效、仅扣 1 枚通货 | ✅ |
| /api/health 回归 200 | ✅ |

## 四、结论

**P3 第一批通过自动审阅，可提交合并。次批（P3.2）候选：祝福石/映道镜/瓦尔宝珠/破溃宝珠（天定铭文）/古灵余烬与溶液（基底改换）/精华/炼丹。**
