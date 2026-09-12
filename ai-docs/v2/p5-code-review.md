# P5.1 代码审阅 — 秘境与层数推进

> 审阅对象：P5.1 工作树（zone 模块 + 3 表/5 秘境种子 + settleKills 奖励加成 + idle 默认层单位 + config）
> 验证：typecheck / build / db:init:game(22 表 / zones 5) / 冒烟 34 断言 全绿

---

## 1. 审阅发现与处置

| 编号 | 级别 | 发现 | 处置 |
| --- | --- | --- | --- |
| M1 | M | challenge = 先 settleKills（灵韵/物品已落库）→ 再 upsert 进度；若进度写入失败，玩家已得奖励但层数未推进，可重复挑战同层再领奖 | 接受：单层奖励为 1 次击杀 + 层加成，影响有限；P5.2 引入战斗日志/幂等键后收敛 |
| M2 | M | 通关后内部 floor 存为 maxFloor+1（21），`GET /zone/progress` 会显示 floor=21 | 文档化：`cleared=true` 为权威标志；floor 仅表示「下一待挑战层」 |
| M3 | M | 解锁仅按 `realm >= min_realm`，未强制「前置秘境已进入」链条 | 批决策如此（p5-plan §1）；P5.2 视需要加链式解锁 |
| L1 | L | 秘境 4 的 Boss 复用「魔王」 | 已登记，待补专属 Boss 单位 |
| L2 | L | challenge 无冷却/体力；因 floor 单调递增不可重复刷同层 | 接受 |
| L3 | L | playerPower 依赖 `game_items.status='equipped'` 与 `game_learned_skills`；若数据越权漂移则战力失真 | equip/unequip 已同步维护，风险低 |
| L4 | L | BIGINT（灵韵/灵石）→ Number 精度债 | 继承登记 |

## 2. 关键正确性核对

- **解锁**：realm1 仅 zone_qingyun 解锁；realm7 时 zone_miwu 解锁（实测）。
- **门槛**：realm1 enter zone_miwu → REALM_TOO_LOW（required=4）；未知 code → ZONE_NOT_FOUND。
- **战力检定**：realm1 战力=20；F1 req=10 胜、F2 req=16 胜、F3 req=22 败（CHALLENGE_FAILED 返回 playerPower/floorRequirement），失败不推进（floor 保持 3、best 2）。
- **层奖励**：胜利灵韵 ≥ 单位境界奖励 + floor×lingyunBonusPerFloor（F1=2）；Boss 层（10/20）使用 bossCode。
- **通关**：连续推进至 F20 胜利 → cleared=true、bestFloor=20；再次 challenge → ALREADY_CLEARED。
- **离线联动**：`idle/settle` 不带 unitCode，在 F10 自动选用 u_boss_yaowang，且 data.zone={code,floor:10,isBoss:true}；显式传 unitCode 仍按传入值（P4.2 兼容）。
- **数据规模**：22 张表；zones 5；进度/状态引用孤儿校验已加入 init 脚本（告警不阻断）。

## 3. 验证命令与结果

```bash
pnpm --filter ./packages/server typecheck    # exit 0
pnpm --filter ./packages/server build         # exit 0
pnpm --filter ./packages/server db:init:game  # 22 张表；zones 5
# 冒烟：34 断言 ALL P5.1 SMOKE PASSED（解锁/门槛/战力检定/Boss 层/通关/离线默认层单位）
curl -s localhost:3000/api/health             # 200 {"status":"ok"}
```

## 4. 结论

无 H 级缺陷；M/L 级以「单层奖励规模有限」「cleared 为权威标志」明确归属。P5.1 可提交。
