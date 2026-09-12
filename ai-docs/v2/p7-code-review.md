# P7 代码审阅 — 剧情章节

> 审阅对象：P7 工作树（game_chapters/game_chapter_progress 两表 + 5 章种子 + ChapterService/Controller + QuestService 奖励包抽取）
> 验证：typecheck / build / db:init:game(26 表 / chapters 5) / 冒烟 21 断言 全绿

---

## 1. 审阅发现与处置

| 编号 | 级别 | 发现 | 处置 |
| --- | --- | --- | --- |
| M1 | M | ChapterService.sync 逐条 pending 调用 grantRewardBundle（N 次 characters UPDATE）+ 末尾批量置位；非原子 | 沿用 P6「可补发不丢奖」模式；章节奖励量大但次数少，影响有限 |
| M2 | M | 章节完成仅校验 `questEndCode`（收尾任务），未校验章节内全部任务 | 线性任务链下等价；非线任务需 P7.2 全量校验（已登记） |
| M3 | M | `currentChapter` 取首个「已解锁且未完成」，全完成时回退最后一章 | 合理默认，前端可据 completed 自行展示 |
| L1 | L | 章节详情内部调用 questService.list 以复用任务状态（多几次查询） | 接受 |
| L2 | L | `unlockedReason` 优先级 realm>prev（与秘境一致） | 有意 |
| L3 | L | 章节 intro/outro 仅存储返回，无演出/过场状态机 | 顺延 P7.2 |
| L4 | L | BIGINT（灵韵/灵石/玉简）→ Number 精度债 | 继承登记 |

## 2. 关键正确性核对

- **解锁链**：新角色仅 chapter_1 unlocked（reason ok），chapter_2 reason realm；升 3 境且 chapter_1 完成后 reason 转为 ok（实测）；另一角色 3 境但未完成 chapter_1 → reason prev。
- **完成判定**：ch1 收尾任务 q_ch1_3 未完成时 chapter/sync completedCount=0；三任务完成后 → chapter_1 completed，发放灵韵 500 / 灵石 1000；重复 sync 不重发。
- **详情**：`GET /chapters/1` 返回绑定秘境 zone_qingyun、3 条任务、intro/outro 对话、奖励；未知章节 → CHAPTER_NOT_FOUND。
- **奖励复用**：QuestService 抽取 `grantRewardBundle`/`applyBundle`，任务与章节共用同一发放实现（P6 冒烟回归通过）。
- **数据规模**：26 张表；chapters 5；章节引用孤儿校验（zone/quest/requiresChapter/进度）入 init 脚本。

## 3. 验证命令与结果

```bash
pnpm --filter ./packages/server typecheck    # exit 0
pnpm --filter ./packages/server build         # exit 0
pnpm --filter ./packages/server db:init:game  # 26 张表；chapters 5
# 冒烟：21 断言 ALL P7 SMOKE PASSED（解锁链/完成判定/幂等/详情/引用）
curl -s localhost:3000/api/health             # 200 {"status":"ok"}
```

## 4. 结论

无 H 级缺陷；M 级均以「线性任务链 + 可补发奖励」明确归属。P7 可提交。
