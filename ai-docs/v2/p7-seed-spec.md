# P7 种子规格 — 章节定义

文件：`packages/server/prisma/seeds/game/chapters.json`

```jsonc
{ "id": 1, "code": "chapter_1", "chapter": 1, "name": "初入仙途", "theme": "初入仙途",
  "minRealm": 1, "zoneCode": "zone_qingyun",
  "questStartCode": "q_ch1_1", "questEndCode": "q_ch1_3",
  "requiresChapter": null, "orderIndex": 1,
  "rewards": { "lingyun": 500, "spiritStones": 1000 },
  "dialogues": { "intro": "……", "outro": "……" } }
```

| 字段 | 说明 |
| --- | --- |
| chapter | 章节序号 1~5 |
| theme | 主题（展示） |
| minRealm | 解锁最低境界 |
| zoneCode | 绑定秘境（引用 game_zones.code） |
| questStartCode / questEndCode | 任务区间；完成判定以 questEndCode 为准 |
| requiresChapter | 前置章节 code（可空） |
| rewards | 同任务奖励结构 |
| dialogues | { intro, outro } 文本 |

落库：`game_chapters`（显式 id，code 冲突 UPDATE）；`game_chapter_progress` 玩家数据保留。
孤儿校验：zoneCode → game_zones.code、questStartCode/questEndCode → game_quest_defs.code、requiresChapter → game_chapters.code。
