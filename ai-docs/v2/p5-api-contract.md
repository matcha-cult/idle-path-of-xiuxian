# P5.1 API 契约 — 秘境与层数

> 通用：JWT；响应 { success, message, data }；错误 data.code（HTTP 200 风格）

## 1. GET /api/game/zones

```json
{ "success": true, "message": "获取秘境图鉴成功",
  "data": { "total": 5, "playerPower": 25, "currentZone": "zone_qingyun",
    "zones": [
      { "id": 1, "code": "zone_qingyun", "name": "青云山脚", "chapter": 1, "orderIndex": 1,
        "minRealm": 1, "unlocked": true, "unitCode": "u_r1_shanxiao", "bossCode": "u_boss_yaowang",
        "basePower": 10, "powerStep": 6, "maxFloor": 20,
        "progress": { "floor": 1, "bestFloor": 0, "cleared": false } } ] } }
```

## 2. GET /api/game/zone/progress

```json
{ "success": true, "message": "获取秘境进度成功",
  "data": { "currentZone": { "code": "zone_qingyun", "name": "青云山脚", "chapter": 1 },
    "floor": 1, "bestFloor": 0, "cleared": false,
    "playerPower": 25, "floorRequirement": 10, "canChallenge": true,
    "isBossFloor": false, "encounterUnit": "u_r1_shanxiao",
    "lingyunBonus": 2 } }
```

## 3. POST /api/game/zone/enter

请求 `{ "zoneCode": "zone_miwu" }`

- 境界不足 → `REALM_TOO_LOW`（data 含 required/current）
- 成功：`{ data: { currentZone, floor, bestFloor } }`

## 4. POST /api/game/zone/challenge

请求 `{ "zoneCode": "zone_qingyun" }`（可选，缺省取当前秘境）

成功：
```json
{ "success": true, "message": "挑战成功：青云山脚 第1层",
  "data": { "zone": { "code": "zone_qingyun", "name": "青云山脚" },
    "floor": 1, "nextFloor": 2, "bestFloor": 1, "cleared": false,
    "playerPower": 25, "floorRequirement": 10, "isBossFloor": false,
    "rewards": { "lingyunGained": 7, "lingyunBonus": 2, "items": [], "kept": 0,
      "salvaged": { "count": 0, "lingyun": 0 }, "sold": { "count": 0, "spiritStones": 0 },
      "currencies": {}, "essences": {} } } }
```

失败码：

| code | 场景 |
| --- | --- |
| CHARACTER_NOT_FOUND | 未创建角色 |
| ZONE_NOT_FOUND | zoneCode 不存在 |
| REALM_TOO_LOW | 进入/挑战秘境境界不足 |
| CHALLENGE_FAILED | 战力不足（data.playerPower < data.floorRequirement） |
| ALREADY_CLEARED | 该秘境已通关 |

## 5. POST /api/game/idle/settle（P4.2 兼容变更）

`unitCode` 改为**可选**：缺省取当前秘境当前层单位（Boss 层取 bossCode）；显式传入仍按传入值。

## 6. 冒烟顺序

见 p5-plan.md §5。
