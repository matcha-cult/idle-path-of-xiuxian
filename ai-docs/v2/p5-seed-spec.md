# P5.1 种子规格 — 秘境

文件：`packages/server/prisma/seeds/game/zones.json`

```jsonc
{ "id": 1, "code": "zone_qingyun", "name": "青云山脚", "chapter": 1, "orderIndex": 1,
  "minRealm": 1,
  "unitCode": "u_r1_shanxiao", "bossCode": "u_boss_yaowang",
  "basePower": 10, "powerStep": 6, "maxFloor": 20,
  "lingyunBonusPerFloor": 2, "bossEveryFloors": 10 }
```

| 字段 | 说明 |
| --- | --- |
| chapter | 章节 1~5（v2 §7.1） |
| orderIndex | 推进顺序；解锁按序前置秘境已进入即可（本批按境界门槛） |
| minRealm | 进入所需最低境界（REALM_TOO_LOW） |
| unitCode / bossCode | 层内单位 / Boss 层单位（引用 unit-templates.code） |
| basePower / powerStep | 第 1 层门槛 / 每层增量 |
| maxFloor | 最大层数（越过即通关） |
| lingyunBonusPerFloor | 每层挑战胜利的额外灵韵 = floor × 该值 |
| bossEveryFloors | 每 N 层为 Boss 层 |

落库：`game_zones`（显式 id，code 冲突 UPDATE）；孤儿校验 unit_code/boss_code 是否存在于 game_unit_templates。
