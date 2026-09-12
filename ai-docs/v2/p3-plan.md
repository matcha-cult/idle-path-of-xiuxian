# P3 实施计划 — 通货经济第一批（炼器核心 7 通货）

> 依据：v2 设计 §5；批内范围经收敛决策（见 §1）
> 状态：执行中

---

## 1. 范围收敛（批决策）

| 决策 | 结论 |
| --- | --- |
| 批内通货 | **7 种炼器核心**：蜕变石/点金石/混沌石/崇高石/剥离石/重铸石/神圣石 |
| 次批（P3.2） | 祝福石（需基础属性浮动范围）、映道镜、瓦尔宝珠、破溃宝珠（天定铭文）、古灵余烬/古灵溶液（基底词缀改换）、精华体系、炼丹（丹药物品类） |
| 品质 0~20 | 本批不动（P1 字段已留）；归 P3.2 |
| 钱包 | 新表 game_wallets（game 库，与物品同库 → 炼器可同事务） |
| 灵石 | 维持 characters.spirit_stones（基本交易货币）；本批炼器不消耗灵石 |
| 通货获取 | 无掉落系统（P4）→ dev 注入接口 currency/grant（生产禁用+共享限流） |
| 传奇 | rarity=3 不可洗炼（LEGENDARY_IMMUTABLE） |
| 基底/天定词缀 | 所有操作保留（base/固定条目不动；is_fractured 定义行不动——种子暂无天定，字段逻辑已预留） |

## 2. 七操作规格（全部消耗对应通货 1 枚；同库事务）

| op | 通货 | 前提 | 效果 |
| --- | --- | --- | --- |
| transmute | 蜕变石 | rarity=0 | 升灵品 + roll 1~2 条（前≤1 后≤1） |
| alchemy | 点金石 | rarity=0 | 升宝品 + roll 3~6 条（前≤3 后≤3） |
| chaos | 混沌石 | rarity=1/2 | 品阶不变，重 roll 词条数与词缀（灵 1~2 / 宝 3~6） |
| exalt | 崇高石 | rarity≥1 | +1 条新词缀；灵品已 2 条时升宝品（总 3 条）；宝品 ≤6 条 |
| annul | 剥离石 | 可 roll 词缀 ≥1 | 随机移除 1 条；品阶不变可至 0 条 |
| scour | 重铸石 | rarity≥1 | 清除全部可 roll 词缀，还原凡品（保留基底/天定）；传奇不可 |
| divine | 神圣石 | 存在可 roll 词缀 | 重 roll 各词缀数值（种类/数量不变） |

错误码：LEGENDARY_IMMUTABLE / RARITY_MISMATCH / NOT_ENOUGH_CURRENCY / NO_AFFIX_TO_REMOVE / MAX_AFFIXES / AFFIX_LIMIT / INVALID_OP。

## 3. 数据模型

- `game_wallets`：id, character_id, currency_code VARCHAR(20), amount BIGINT, updated_at；UNIQUE(character_id, currency_code)
- 通货定义种子 `currencies.json`（13 种全量定义，7 种 implemented=true）：
  混沌石 chaos / 剥离石 annul / 重铸石 scour / 点金石 alchemy / 蜕变石 transmute / 崇高石 exalt / 神圣石 divine / 祝福石 blessed / 映道镜 mirror / 瓦尔宝珠 vaal / 破溃宝珠 fracture / 古灵余烬 ember / 古灵溶液 wisp
- schema.prisma 增 game_wallets 模型；init-game-db 增 DDL + 种子重灌（显式 id 1~13）

## 4. API（契约详见 p3-api-contract.md）

- GET /api/game/currencies — 通货图鉴（持有量 + 用途）
- POST /api/game/currency/grant {code,count} — dev 注入（1~9999）
- POST /api/game/item/craft {itemId, op} — 七操作统一入口

## 5. 冒烟清单

1. wallets 建表 + 13 种通货种子；grant chaos 3 → 图鉴显示持有 3
2. 生成凡品 → transmute 灵品（1~2 条）；alchemy 宝品（3~6 条）
3. chaos 宝品重 roll：条数/种类变化且品阶不变
4. exalt 宝品 +1 条（≤6；满 6 → MAX_AFFIXES）；灵品满 2 → 升宝品
5. annul 逐条剥离至 0 条仍宝品；0 条 → NO_AFFIX_TO_REMOVE
6. scour → 凡品 0 条（基底保留）
7. divine 数值变化但词条不变
8. 传奇洗炼 → LEGENDARY_IMMUTABLE；通货不足 → NOT_ENOUGH_CURRENCY
9. grant 越权/限流/生产守卫、401、health 回归
