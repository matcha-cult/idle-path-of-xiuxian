# P6 实施计划 — 任务系统（主线任务逻辑服）

> 依据：v2 设计 §7（主线 5 章 / 自动触发 / 任务逻辑服 / 种子定义）、§11.7-11.8（quest_defs / quest_progress）、§12.2（任务 API）
> 状态：执行中

---

## 1. 范围收敛（批决策）

| 决策 | 结论 |
| --- | --- |
| **P6.1（本批）** | 主线任务定义 seed（5 章 12 任务）+ 自动触发（境界 + 前置任务）+ 无状态目标评估 + 奖励发放（幂等）+ 任务 API |
| **P6.2（顺延）** | 事件驱动目标（击杀计数/进入区域触发）、任务对话演出、章节解锁演出、任务与秘境/掉落联动钩子 |
| 触发机制 | 与 PoE 一致：**不主动接取**。`triggerRealm`（最低境界）+ `requiresQuests`（前置已完成）双条件；满足即 active |
| 目标评估 | **无状态派生**（不新增计数器）：`reach_realm` / `zone_best_floor` / `zone_cleared` / `own_items` / `learn_skills` / `lingyun`，从 characters / zone_progress / items / learned_skills 实时计算 |
| 完成与奖励 | `POST /game/quest/sync`：按 order 评估 → 完成者写 `game_quest_progress`（ON CONFLICT DO NOTHING，插入成功才发奖，天然幂等）→ 按序级联前置 |
| 奖励类型 | lingyun / spiritStones / jadeSlips（characters，一次 UPDATE 累计）+ currencies / essences（game 库 upsert） |
| 只读查询 | `GET /quests`、`GET /quests/:code` 仅计算与展示，不写库、不发奖 |
| 章节内容 | 5 章 12 任务（每章 2~3 个），奖励递增；境界门槛 1/2/3/5/6/9/12 等 |
| 事件钩子 | 本批不做；客户端在关键动作后调用 sync（P6.2 改为服务端事件触发） |

## 2. 数据模型（+2 表 → 共 24 表）

```
game_quest_defs     任务定义（code/chapter/name/trigger_type/trigger_cond/objectives/rewards/dialogues/next_quest/order_index）
game_quest_progress 角色任务进度（character_id/quest_code/status/objectives/completed_at，UNIQUE(character_id,quest_code)）
```

## 3. 种子（quest-defs.json，12 条）

- 目标 JSON：`[{ "type": "reach_realm", "value": 2, "desc": "达到 2 境" }]`
- 触发 JSON：`{ "realm": 2, "requires": ["q_ch1_1"] }`
- 奖励 JSON：`{ "lingyun": 200, "spiritStones": 1000, "jadeSlips": 1, "currencies": { "transmute": 2 }, "essences": { "ess_atk": 1 } }`

| 章节 | 任务 | 目标 | 主要奖励 |
| --- | --- | --- | --- |
| 1 | q_ch1_1 初入仙途 | reach_realm 1 | 灵韵 100 / 灵石 500 |
| 1 | q_ch1_2 夯实根基 | reach_realm 2 | 灵韵 200 / 玉简 1 |
| 1 | q_ch1_3 秘境初探 | zone_qingyun best≥3 | 灵韵 300 / 蜕变石 2 |
| 2 | q_ch2_1 下山历练 | reach_realm 4 | 灵韵 500 / 灵石 2000 |
| 2 | q_ch2_2 迷雾追踪 | zone_miwu best≥1 | 灵韵 600 / 玉简 1 / 锋锐精华 1 |
| 2 | q_ch2_3 小有所成 | learn_skills 2 + own_items 5 | 灵韵 800 / 点金石 2 |
| 3 | q_ch3_1 秘境夺宝 | reach_realm 7 | 灵韵 1200 / 灵石 5000 |
| 3 | q_ch3_2 古海探秘 | zone_guhai best≥3 | 灵韵 1500 / 混沌石 2 / 悟性精华 1 |
| 4 | q_ch4_1 大劫将临 | reach_realm 10 | 灵韵 2000 / 玉简 2 |
| 4 | q_ch4_2 身经百战 | own_items 10 + lingyun 5000 | 灵韵 2500 / 崇高石 1 / 蕴灵精华 1 |
| 5 | q_ch5_1 飞升前夜 | reach_realm 13 | 灵韵 4000 / 玉简 3 |
| 5 | q_ch5_2 合道归一 | zone_hundun cleared | 灵韵 8000 / 神圣石 1 + 映道镜 1 / 悟性精华 2 |

## 4. 模块

```
modules/game/quest/
├── quest.module.ts      依赖 CharacterModule + GameDatabaseService
├── quest.controller.ts  GET /api/game/quests、GET /api/game/quests/:code、POST /api/game/quest/sync
└── quest.service.ts     触发/目标评估/完成/奖励发放（幂等）
```

## 5. API（契约详见 p6-api-contract.md）

- GET  /api/game/quests — 任务列表（状态 locked/active/completed + 目标进度 + claimable）
- GET  /api/game/quests/:code — 任务详情
- POST /api/game/quest/sync — 推进任务（激活 + 完成 + 发奖，幂等）

## 6. 冒烟清单

1. 建表 + quest 种子 12 条；新角色 GET /quests → q_ch1_1 active（realm1 满足），其余 locked
2. sync → q_ch1_1 completed 并发灵韵 100/灵石 500；再次 sync → 不重复发放
3. 升到 2 境 → q_ch1_2 变 active；sync → completed，玉简 1
4. 目标型：zone_qingyun best≥3（挑战 3 层）→ q_ch1_3 完成
5. 级联：一次 sync 可连续完成多个满足条件的前置链
6. 奖励落库：通货进 wallet、精华进 essence inventory、灵石/玉简/灵韵进 characters
7. GET /quests/:code 未知 code → QUEST_NOT_FOUND；只读接口不改变状态
8. health 200 + P5.2 挑战回归

## 7. 风险 / 技术债

- 无状态目标无法表达「累计击杀 N」类计数目标 → P6.2 事件计数。
- 奖励跨 characters + wallet + essence 三处写入非原子 → 以「先记完成、再发奖」顺序，失败偏向玩家（可重发风险已由 DO NOTHING 限制为一次性插入；若发奖中途失败，下次 sync 不会重发 → 需补偿任务）。P6.2 引入发奖幂等键。
- 任务仅主线；支线/日常/声望顺延。
