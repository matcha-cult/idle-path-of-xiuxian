# P4 代码审阅 — 单位系统与掉落结算（P4.1）

> 审阅对象：commit 前工作树（unit 模块 + 5 表 DDL/种子 + config + README）
> 验证：typecheck / build / db:init:game / 冒烟 39 断言 / 审阅探针 9 断言 全绿

---

## 1. 审阅发现与处置

| 编号 | 级别 | 发现 | 处置 |
| --- | --- | --- | --- |
| H1 | H | 拾取规则 CRUD 的 normalizeAction 仅放行 keep/salvage/discard → 新建 `sell` 规则被静默改写为 keep，「出售」动作无法配置（设计 §9.3 要求三动作） | **已修**：放行 sell（create/update 共用），审阅探针实测 sold>0、灵石入账 |
| M1 | M | kill 结算跨「items/钱包/精华（game 库）」与「灵韵/灵石（characters）」→ 无法单事务；中途异常会留下已生成物品或未入账资源 | 接受：kill 为 **dev 接口**；正式产出走 P4.2 离线结算（届时按天批量 + 幂等键）。已在 p4-plan §9 登记 |
| M2 | M | spawn/kill 先扣限流额度、后校验单位存在性 → 无效 code 白耗 1 次额度 | 接受并文档化：限流本身用于遏制 DB 读（loadUnit 有查询），且单位图鉴公开，无枚举价值 |
| M3 | M | kill 返回的 `items` 数组截断 50 条，但 `kept` 计全量 → 两者不等时易误读 | 契约已注明「items 最多 50 条」；冒烟断言 kept==len(items) 仅在 ≤50 时成立 |
| L1 | L | 掉落条目未在 init 阶段校验 currency_code/essence_code/base_id 是否存在（仅校验单位→掉落表） | 顺延：加一轮 orphan 校验（非阻断告警） |
| L2 | L | 隐藏词条 atk_speed_pct 无对应基础属性，finalStats 以 `atkSpeedPct` 平铺字段输出 | 设计如此（战斗属性 P5 定义 atkSpeed 基值后再挂载） |
| L3 | L | 精华仍为 6 种单阶、未做 3 合 1 升阶；先由掉落闭环（本批已兑现「精华来源=怪物基础掉落」） | 顺延 P4.2 / 精华全表批次 |
| L4 | L | BIGINT（lingyun/spirit_stones/wallet/essence count）→ Number 精度债 | 继承 P2 登记，P4.2 前统一处理 |

## 2. 关键正确性核对

- **T 阶硬约束**：base 条目解析后 `tier > realm + tier_offset` → 跳过并计入 blockedByTier；冒烟实测 realm1 单位只产出 T1、妖王（realm3/offset1）可产 T4 且 blockedByTier=0。
- **境界模板**：hiddenCount=0 时 finalStats 严格等于 baseStats；boss baseStats 覆盖仅覆盖显式字段。
- **隐藏词条**：按权重不放回抽样（按 id 去重）；hiddenCount=6 实测 6 条互异；乘法 % 作用于 hp/atk/def/spiritPower，all_stats_pct 同时作用四项。
- **辨宝法阵**：玩家规则优先（priority DESC, id ASC），无玩家规则回退 character_id=0 模板；首条命中生效；无命中走 config 回退（默认 salvage）。
  - 默认模板「宝品及以上保留」→ 实测凡/灵被分解、宝品入包；自建「全保留」→ salvaged=0；自建「全出售」→ 灵石按 tier×10×(rarity+1) 入账且灵韵不虚增。
- **灵韵产出**：realm1 单位每杀 5（含隐藏 lingyun_gain 时按比例提升），与物品并存互不挤占。
- **掉落闭环**：currency → game_wallets upsert；essence → game_essence_inventory upsert（SELECT 按 code 解析 id）。
- **幂等种子**：显式 id + setval；18 张表；单位 23 / 隐藏词条 11 / 掉落表 9 / 条目 126 / 池挂载 198。

## 3. 验证命令与结果

```bash
pnpm --filter ./packages/server typecheck   # exit 0
pnpm --filter ./packages/server build        # exit 0
pnpm --filter ./packages/server db:init:game # 18 表；units 23 / hidden 11 / drops 9(126) / links 198
# 冒烟：39 断言 ALL P4 SMOKE PASSED（健康/图鉴/spawn/kill/辨宝/Boss 跨阶/中立拦截/参数校验）
# 审阅探针：9 断言 P4 REVIEW PROBE PASSED（sell 动作落库与入账、spiritStones 增量、6 隐藏互异）
curl -s localhost:3000/api/health           # 200 {"status":"ok"}
```

## 4. 结论

H1 已修复并回归；M/L 级以「dev 接口边界 + P4.2 离线结算」明确归属。P4.1 可提交。
