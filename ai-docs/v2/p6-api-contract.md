# P6 API 契约 — 任务系统

> 通用：JWT；响应 { success, message, data }；错误 data.code（HTTP 200 风格）

## 1. GET /api/game/quests

```json
{ "success": true, "message": "获取任务列表成功",
  "data": { "total": 12, "completed": 2,
    "quests": [
      { "code": "q_ch1_1", "chapter": 1, "name": "初入仙途", "orderIndex": 1,
        "status": "completed", "claimable": false,
        "objectives": [ { "type": "reach_realm", "value": 1, "current": 1, "done": true, "desc": "踏入修行" } ] },
      { "code": "q_ch1_2", "chapter": 1, "name": "夯实根基", "orderIndex": 2,
        "status": "active", "claimable": false,
        "objectives": [ { "type": "reach_realm", "value": 2, "current": 1, "done": false, "desc": "达到 2 境" } ] },
      { "code": "q_ch3_1", "chapter": 3, "name": "秘境夺宝", "orderIndex": 7,
        "status": "locked", "claimable": false, "objectives": [] } ] } }
```

`status` ∈ `locked | active | completed`；`claimable` = active 且全部目标达成（可调用 sync 领取）。

## 2. GET /api/game/quests/:code

单条任务视图（字段同 §1 元素，额外含 `trigger`/`rewards`/`dialogues`/`nextQuest`）。

失败码：`QUEST_NOT_FOUND`。

## 3. POST /api/game/quest/sync

无请求体。按 orderIndex 评估：激活满足触发的任务、完成全部目标达成的任务并**一次性**发放奖励；返回本次实际完成项。

```json
{ "success": true, "message": "任务同步完成：新完成 1 项",
  "data": { "completedCount": 1, "completed": [ { "code": "q_ch1_1", "name": "初入仙途",
    "rewards": { "lingyun": 100, "spiritStones": 500 } } ],
    "totals": { "lingyun": 100, "spiritStones": 500, "jadeSlips": 0,
      "currencies": {}, "essences": {} } } }
```

幂等：同一任务只会在首次完成时发奖；重复 sync 返回 `completedCount: 0`。

## 4. 冒烟顺序

见 p6-plan.md §6。
