# P6 种子规格 — 任务定义

文件：`packages/server/prisma/seeds/game/quest-defs.json`

```jsonc
{
  "id": 2,
  "code": "q_ch1_2",
  "chapter": 1,
  "name": "夯实根基",
  "orderIndex": 2,
  "triggerType": "auto",
  "trigger": { "realm": 2, "requires": ["q_ch1_1"] },
  "objectives": [ { "type": "reach_realm", "value": 2, "desc": "达到 2 境" } ],
  "rewards": { "lingyun": 200, "jadeSlips": 1 },
  "dialogues": { "start": "根基不牢，地动山摇。", "done": "你已站稳脚跟。" },
  "nextQuest": "q_ch1_3"
}
```

## 字段

| 字段 | 说明 |
| --- | --- |
| chapter | 章节 1~5（v2 §7.1） |
| orderIndex | 全局推进序；评估按此排序 |
| triggerType | `auto`（默认）/ `manual`（预留） |
| trigger.realm | 最低境界门槛 |
| trigger.requires | 前置任务 code 列表（须已完成） |
| objectives[].type | reach_realm / zone_best_floor / zone_cleared / own_items / learn_skills / lingyun |
| objectives[].key | zone_best_floor/zone_cleared 的秘境 code |
| objectives[].value | 目标阈值（reach_realm/zone_best_floor/own_items/learn_skills/lingyun 必填；zone_cleared 用布尔） |
| objectives[].desc | 展示文本 |
| rewards | lingyun / spiritStones / jadeSlips / currencies{code:count} / essences{code:count}，均可选 |
| dialogues | { start, done } 文本（本批仅存储展示） |
| nextQuest | 后续任务 code（展示用） |

## 目标类型与数据来源

| type | 来源 | 达成判定 |
| --- | --- | --- |
| reach_realm | characters.realm | realm ≥ value |
| zone_best_floor | game_zone_progress.best_floor（key=zoneCode） | best ≥ value |
| zone_cleared | game_zone_progress.cleared（key=zoneCode） | cleared = true |
| own_items | count(game_items WHERE character_id，含 bag/equipped) | count ≥ value |
| learn_skills | count(game_learned_skills WHERE character_id) | count ≥ value |
| lingyun | characters.lingyun | lingyun ≥ value |

## 落库

- `game_quest_defs`（显式 id，code 冲突 UPDATE）；重灌配置表，`game_quest_progress` 玩家数据保留。
- 孤儿校验：`trigger.requires` / `nextQuest` 引用未知 quest code → 告警；`zone_best_floor`/`zone_cleared` 的 key 引用未知 zone → 告警。
