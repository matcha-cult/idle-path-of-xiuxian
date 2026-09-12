# P4 实施计划 — 单位系统与掉落结算

> 依据：v2 设计 §3.5 / §4 / §8 / §9；批裁剪决策见 §1
> 状态：执行中（P4.1 本批 / P4.2 顺延）

---

## 1. 范围收敛（批决策）

| 决策 | 结论 |
| --- | --- |
| **P4.1（本批）** | 境界模板 + 单位模板 seed + 隐藏词条池 + 掉落表 seed + 掉落结算 + 辨宝法阵执行 + 灵韵产出 |
| **P4.2（顺延）** | 离线收益（12h 封顶 × 60% 效率、日产出上限 200 件）+ 秘境层数与推进 |
| 单位实例 | **不落库**：单位按模板即时实例化（roll 隐藏词条 → 计算战斗属性），仅返回快照；战斗数值调优归 P5 战斗系统 |
| 隐藏词条 | 独立表 game_unit_hidden_affixes（不混入物品 game_affixes），池经 game_unit_hidden_pools 挂载到单位 |
| 掉落模型 | 表级 drops_per_kill + tier_offset；条目按权重单抽；支持 base（指定基底或指定 T 阶）/ currency / essence 三类 |
| 掉落归属 | 掉落物品直接落 bag；经辨宝法阵判定 keep/salvage/sell/discard |
| 分解/出售 | 分解 → 灵韵（tier × 2 × (rarity+1)）；出售 → 灵石（tier × 10 × (rarity+1)）；弃置 → 无返还 |
| 无匹配规则 | 回退动作走 config（默认 salvage，实现设计「不符 → 自动分解」） |
| 默认规则来源 | 玩家无自建规则时，回退系统模板（game_pickup_rules.character_id = 0） |
| 精华来源 | 兑现 P3.3 遗留：精华由怪物基础掉落表产出（kind=essence） |
| 炼丹 | 顺延：丹药需 P4 掉落材料 + 丹方，排 P4.2 之后 |
| 战斗时长/自动战斗 | P4.1 不做逐场战斗模拟；P5 接入战斗结算时长与秘境层数 |

## 2. 数据模型（+5 表 → 共 18 表）

```
game_unit_hidden_affixes  隐藏词条定义（code/name/effects/weight）
game_unit_hidden_pools    单位模板 ↔ 隐藏词条池（UNIQUE(unit_template_id, hidden_affix_id)）
game_unit_templates       单位模板（code/name/realm/camp/gives_lingyun/base_stats/hidden_pool/drop_table_ref）
game_drop_tables          掉落表（code/name/drops_per_kill/tier_offset）
game_drop_entries         掉落条目（kind=base|currency|essence + 目标 + 数量 + 权重）
```

## 3. 境界模板与隐藏词条

- **境界模板**：config `unitRealmBase`（hp/atk/def/spiritPower/lingyun 各自 base × growth^(realm−1)，取整）。
- 单位 base_stats = 境界模板（按 realm）× 单位 seed 的 `baseStats` 覆盖项（可选）。
- 隐藏词条 effects 支持：`hp_pct/atk_pct/def_pct/spirit_power_pct/atk_speed_pct/all_stats_pct`（乘法）、`crit/extra_damage_pct/resist_pct/lingyun_gain`（附加字段）。
- 实例化：按权重从单位池抽 `unitHiddenAffixCount`（[1,3]）条，计算 finalStats；配置可传 hiddenCount 覆盖（便于冒烟）。

## 4. 掉落表与掉落规则

- 每次击杀做 `drops_per_kill` 次加权单抽（每抽命中 1 条目）。
- **T 阶硬约束**：base 条目解析出的底材 tier > unit.realm + table.tier_offset → 跳过并计入 blockedByTier（Boss 跨阶由 tier_offset 表达）。
- base 条目：`baseId`（指定基底）或 `baseTier`（该 T 阶内按 drop_weight 随机）+ `rarity`。
- currency 条目 → game_wallets 累加；essence 条目 → game_essence_inventory 累加。
- 灵韵：gives_lingyun 单位每杀产出 `境界模板.lingyun`（受隐藏词条 lingyun_gain 加成），与物品掉落并存互不挤占。

## 5. 辨宝法阵执行（v2 §9.3）

- 取玩家启用规则（priority DESC, id ASC）逐条判定，**首条命中生效**；无玩家规则则取系统模板 character_id=0。
- 命中条件：rarity ≥ rarity_min **且** tier ≥ tier_min **且**（affix_codes 为空 **或** 物品含其中任一 code）。
- 动作：keep（入包）/ salvage（分解→灵韵）/ sell（出售→灵石）/ discard（弃置）。
- 无命中 → config `lootFallbackAction`（默认 salvage）。

## 6. 数据与配置变更

- seed：`unit-hidden-affixes.json`（约 11 条）、`unit-templates.json`（约 23 单位）、`drop-tables.json`（5 阶梯表 + 4 Boss 表）
- config：`unitRealmBase` / `unitHiddenAffixCount` / `lootFallbackAction` / `lootSalvageLingyunPerTier` / `lootSellSpiritStonesPerTier` / `maxKillsPerRequest`
- init-game-db.mjs：+5 表 DDL + 种子重灌（显式 id + setval + 孤儿校验）
- 模块：`modules/game/unit/`（types/service/controller/module），game.module 注册

## 7. API（契约详见 p4-api-contract.md）

- GET  /api/game/units — 单位图鉴（境界/阵营/灵韵标记/掉落表/隐藏池）
- GET  /api/game/drop-tables — 掉落表图鉴
- POST /api/game/unit/spawn — 即时实例化（roll 隐藏词条 → 战斗属性快照）★dev
- POST /api/game/unit/kill — 掉落结算（灵韵 + 掉落 + 辨宝法阵）★dev

## 8. 冒烟清单

1. 建表 + 种子：单位 23 / 隐藏词条 11 / 掉落表 9；图鉴字段完整
2. spawn 指定 hiddenCount=0/2：finalStats 随隐藏词条变化；非法 code → UNIT_NOT_FOUND
3. kill realm1 单位 ×N：灵韵按境界模板累加；掉落均 T ≤ 单位境界
4. Boss 跨阶：tier_offset 生效，可掉出高于自身境界 1~2 阶底材
5. 辨宝法阵：默认规则「宝品及以上保留」→ 凡/灵自动分解得灵韵；自建 keep 规则命中的物品入包
6. currency/essence 掉落：钱包与精华存量增加（精华来源闭环）
7. 中立/友方单位 kill → NOT_KILLABLE；count 越界 → INVALID_PARAM；生产守卫 + 限流
8. health 200 回归

## 9. 风险 / 技术债

- 单位实例不落库：P5 接入真实战斗与秘境进度时需补 `game_battle_logs` 或层数进度表。
- 掉落单抽模型（每杀 drops_per_kill 次单抽）为简化；后续可扩展为「必掉保底 + 稀有加权」。
- 单位属性公式未经战斗验证，P5 调参；config 已留 growth 旋钮。
- kill 为 dev 接口；正式产出走 P4.2 离线/秘境结算。
