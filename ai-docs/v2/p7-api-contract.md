# P7 API 契约 — 章节

> 通用：JWT；响应 { success, message, data }；错误 data.code（HTTP 200 风格）

## 1. GET /api/game/chapters

```json
{ "success": true, "message": "获取章节列表成功",
  "data": { "total": 5, "currentChapter": 1,
    "chapters": [
      { "code": "chapter_1", "chapter": 1, "name": "初入仙途", "theme": "初入仙途",
        "minRealm": 1, "zoneCode": "zone_qingyun", "orderIndex": 1,
        "unlocked": true, "unlockedReason": "ok", "completed": false,
        "quests": { "total": 3, "completed": 1 } },
      { "code": "chapter_2", "chapter": 2, "name": "下山历练", "minRealm": 3,
        "unlocked": false, "unlockedReason": "realm", "completed": false,
        "requiresChapter": "chapter_1", "quests": { "total": 3, "completed": 0 } } ] } }
```

`unlockedReason` ∈ `ok | realm | prev`。

## 2. GET /api/game/chapters/:chapter

`:chapter` 为章节序号（1~5）或 code。返回详情：

```json
{ "success": true, "message": "获取章节详情成功",
  "data": { "chapter": {
    "code": "chapter_1", "chapter": 1, "name": "初入仙途", "theme": "初入仙途",
    "minRealm": 1, "zone": { "code": "zone_qingyun", "name": "青云山脚" },
    "unlocked": true, "completed": false,
    "requiresChapter": null,
    "rewards": { "lingyun": 500, "spiritStones": 1000 },
    "dialogues": { "intro": "……", "outro": "……" },
    "quests": [ { "code": "q_ch1_1", "name": "初入仙途", "status": "completed" },
                { "code": "q_ch1_2", "name": "夯实根基", "status": "active" } ] } } }
```

失败码：`CHAPTER_NOT_FOUND`。

## 3. POST /api/game/chapter/sync

无请求体。按 order 评估：解锁且收尾任务已完成 → 标记章节完成并发放奖励（幂等）。

```json
{ "success": true, "message": "章节同步完成：新完成 1 章",
  "data": { "completedCount": 1,
    "completed": [ { "code": "chapter_1", "name": "初入仙途",
      "rewards": { "lingyun": 500, "spiritStones": 1000 } } ],
    "totals": { "lingyun": 500, "spiritStones": 1000, "jadeSlips": 0,
      "currencies": {}, "essences": {} } } }
```

## 4. 冒烟顺序

见 p7-plan.md §6。
