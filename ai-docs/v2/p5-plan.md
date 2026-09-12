# P5.1 实施计划 — 秘境与层数推进

> 依据：v2 设计 §7.1（章节→境界→T 阶）、§9.1（进入秘境 → 战斗结算 → 挑战更高层）、§10（解锁阶梯）
> 状态：执行中（P5.1 本批 / P5.2 顺延）

---

## 1. 范围收敛（批决策）

| 决策 | 结论 |
| --- | --- |
| **P5.1（本批）** | 秘境定义 seed + 解锁（境界门槛）+ 当前秘境状态 + 层数推进（战力判定）+ 每层奖励（灵韵加成 + 层内单位掉落）+ 离线默认按当前秘境层单位结算 |
| **P5.2（顺延）** | 逐场战斗模拟/战斗时长、层数掉落曲线与保底、秘境解锁演出与章节任务联动 |
| 战斗判定 | **确定性战力检定**（P5.1 抽象）：`playerPower ≥ basePower + (floor−1)×powerStep` 即胜；整合 P1 装备数 + P2 功法等级 |
| 战力公式 | `realm×realmWeight + 已装备件数×equipWeight + floor(功法等级和 / skillDivisor)`（config `zonePower`） |
| 秘境数量 | 5 个（每章 1 个），order_index 1~5；境界门槛 1/4/7/10/13 |
| 层数 | 每秘境 maxFloor 20；`floor % bossEveryFloors == 0` 为该层 Boss 战 |
| 层奖励 | 挑战胜利 = 层内单位 1 次结算（复用 settleKills）+ `floor × lingyunBonusPerFloor` 灵韵加成 |
| 推进 | 胜利 `floor+1`；`best_floor` 记录已通过层；`floor > maxFloor` 标记 cleared |
| 失败 | 不消耗、不推进，返回 `CHALLENGE_FAILED`（含 playerPower/floorReq） |
| 离线联动 | `idle/settle` 的 `unitCode` 改为可选：缺省取当前秘境当前层单位（Boss 层取 bossCode） |
| 层掉落曲线 | 本批不额外加掉落倍率（P5.2）；层奖励只加灵韵 |

## 2. 数据模型（+3 表 → 共 22 表）

```
game_zones           秘境定义（code/name/chapter/order_index/min_realm/unit_code/boss_code/
                     base_power/power_step/max_floor/lingyun_bonus_per_floor/boss_every_floors）
game_zone_progress   角色×秘境进度（floor/best_floor/cleared，UNIQUE(character_id, zone_id)）
game_zone_state      角色当前秘境（character_id UNIQUE → zone_id）
```

## 3. 种子（zones.json，5 条）

| order | code | chapter | minRealm | 单位 / Boss | basePower | step | 每层灵韵 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | zone_qingyun | 1 | 1 | u_r1_shanxiao / u_boss_yaowang | 10 | 6 | 2 |
| 2 | zone_miwu | 2 | 4 | u_r4_xueyan / u_boss_dongfuzhu | 50 | 7 | 5 |
| 3 | zone_guhai | 3 | 7 | u_r7_jiaomo / u_boss_mowang | 110 | 8 | 10 |
| 4 | zone_dajie | 4 | 10 | u_r10_guiwang / u_boss_mowang | 180 | 9 | 18 |
| 5 | zone_hundun | 5 | 13 | u_r13_feishengmo / u_boss_hundun | 260 | 8 | 30 |

（maxFloor 20；bossEveryFloors 10；满配战力 ≈ realm14×20 + 10×5 + 180/2 = 420 ≥ 秘境5 F20 = 412）

## 4. API（契约详见 p5-api-contract.md）

- GET  /api/game/zones — 秘境图鉴（解锁状态 + 各秘境进度）
- GET  /api/game/zone/progress — 当前秘境/层/战力/下一层门槛
- POST /api/game/zone/enter {zoneCode} — 切换当前秘境（境界门槛 REALM_TOO_LOW）
- POST /api/game/zone/challenge {zoneCode?} — 层数挑战（战力检定 → 奖励 → 推进）
- POST /api/game/idle/settle {unitCode?} — unitCode 缺省取当前秘境层单位（P4.2 向后兼容）

## 5. 冒烟清单

1. 建表 + zones 种子 5 条；`GET /zones` 解锁状态正确（realm1 → 仅 zone_qingyun）
2. 未达境界 enter 高级秘境 → REALM_TOO_LOW；enter 本级 → 成功且 state 落库
3. 低战力 challenge → CHALLENGE_FAILED（返回 playerPower/floorReq），floor 不推进
4. grant 灵韵/升级功法或装备后战力提升 → challenge 胜利，floor 1→2，best_floor=1，奖励灵韵 ≥ 层加成
5. Boss 层：把进度直改到 floor=10 后 challenge → 使用 bossCode 单位
6. 通关：floor=20 胜利后 cleared=true，再次 challenge → ALREADY_CLEARED
7. idle/settle 不带 unitCode → 使用当前秘境层单位；带 unitCode 向后兼容
8. health 200 + P4.1/P4.2 回归

## 6. 风险 / 技术债

- 战力判定为确定性抽象，真实战斗/技能结算顺延 P5.2；公式旋钮在 config。
- 挑战无冷却、无体力消耗；因 floor 单调递增，不可重复刷同层，风险有限。
- 层掉落曲线（深度加成/保底）未做，层奖励仅灵韵 → P5.2。
- 秘境 4 的 Boss 复用「魔王」，待补专属 Boss 单位。
- `last_settle_at`/`zone_progress`/`zone_state` 多表写入非事务 → 保持「偏向玩家」策略。
