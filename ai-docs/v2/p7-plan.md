# P7 实施计划 — 剧情章节（5 章主线编排）

> 依据：v2 设计 §7.1（5 章主线 / 主题 / 境界 / T 阶范围）、§7.3（剧情配置种子化）、§10（系统解锁阶梯）
> 状态：执行中

---

## 1. 范围收敛（批决策）

| 决策 | 结论 |
| --- | --- |
| **P7.1（本批）** | 章节定义 seed（5 章）+ 章节解锁链（境界 + 前置章节）+ 章节完成判定（收尾任务完成）+ 章节奖励（幂等）+ 章节 API |
| **P7.2（顺延）** | 演出脚本/逐句对话推进、章节过场、UI 状态机、任务事件计数（P6.2） |
| 章节完成 | 章节的 `questEndCode`（收尾任务）在 `game_quest_progress` 中为 completed |
| 章节解锁 | `realm ≥ min_realm` 且（无前置 或 前置章节 completed） |
| 奖励 | 复用任务奖励结构（lingyun/spiritStones/jadeSlips/currencies/essences）；独立表记录 `rewards_granted` 保证幂等 |
| 章节↔秘境联动 | 每章绑定一个秘境 `zone_code`（1↔青云山脚 … 5↔混沌之隙），详情返回秘境与任务清单 |
| 只读查询 | GET 接口不写库；`POST /chapter/sync` 负责完成判定与发奖 |
| 演出 | 本批仅存/取 `dialogues`（章节 intro/outro 文本），不驱动播放 |

## 2. 数据模型（+2 表 → 共 26 表）

```
game_chapters          章节定义（code/chapter/name/theme/min_realm/zone_code/quest_start_code/quest_end_code/requires_chapter/rewards/dialogues/order_index）
game_chapter_progress  角色章节进度（character_id/chapter_id/status/rewards_granted/completed_at，UNIQUE(character_id,chapter_id)）
```

## 3. 种子（chapters.json，5 条）

| 章 | code | 主题 | minRealm | 秘境 | 任务区间 | 前置 | 章节奖励 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | chapter_1 | 初入仙途 | 1 | zone_qingyun | q_ch1_1~q_ch1_3 | — | 灵韵 500 / 灵石 1000 |
| 2 | chapter_2 | 下山历练 | 3 | zone_miwu | q_ch2_1~q_ch2_3 | chapter_1 | 灵韵 1000 / 玉简 1 |
| 3 | chapter_3 | 秘境夺宝 | 6 | zone_guhai | q_ch3_1~q_ch3_2 | chapter_2 | 灵韵 2000 / 混沌石 2 |
| 4 | chapter_4 | 大劫将临 | 9 | zone_dajie | q_ch4_1~q_ch4_2 | chapter_3 | 灵韵 3000 / 玉简 2 |
| 5 | chapter_5 | 飞升前夜 | 12 | zone_hundun | q_ch5_1~q_ch5_2 | chapter_4 | 灵韵 6000 / 神圣石 1 / 悟性精华 1 |

## 4. 模块

章节逻辑并入 quest 模块（共享任务进度读取与奖励发放）：
```
modules/game/quest/
├── chapter.service.ts     章节解锁/完成/发奖（幂等）
├── chapter.controller.ts  GET /chapters、GET /chapters/:chapter、POST /chapter/sync
└── quest.module.ts        注册 ChapterService/ChapterController
```

## 5. API（契约详见 p7-api-contract.md）

- GET  /api/game/chapters — 章节列表（unlocked/completed + 任务完成度）
- GET  /api/game/chapters/:chapter — 章节详情（秘境/任务清单/对话/奖励）
- POST /api/game/chapter/sync — 章节完成判定与发奖（幂等）

## 6. 冒烟清单

1. 建表 + 章节种子 5 条；新角色 GET /chapters → 仅 chapter_1 unlocked，其余 locked
2. 未完成收尾任务时 sync → completedCount 0
3. 完成章 1 全部任务（q_ch1_1/1_2/1_3）后 chapter/sync → chapter_1 completed + 发放（灵韵 500 / 灵石 1000）；重复 sync 不重发
4. 升 3 境后 chapter_2 解锁（前置 chapter_1 已完成）；未完成 ch2 任务时 sync 不发
5. 完成 ch2 收尾任务 → chapter_2 completed 且玉简 +1
6. GET /chapters/:chapter 详情含 zone/quests/dialogues/rewards；未知 chapter → CHAPTER_NOT_FOUND
7. health 200 + P6 任务回归

## 7. 风险 / 技术债

- 章节完成仅看收尾任务，不校验中间任务（线性链下等价；非线任务需 P7.2 全量校验）。
- 奖励发放在 quest/chapter 两处共用 applyBundle，仍跨三表非原子 → 沿用「先记后发、可补发」。
- 演出/过场未做。
