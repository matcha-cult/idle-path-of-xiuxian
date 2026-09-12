# P6 代码审阅 — 任务系统（主线任务逻辑服）

> 审阅对象：P6 工作树（quest_defs/quest_progress 两表 + 12 任务种子 + quest 模块 + 幂等发奖）
> 验证：typecheck / build / db:init:game(24 表 / quest defs 12) / 冒烟 25 断言 全绿

---

## 1. 审阅发现与处置

| 编号 | 级别 | 发现 | 处置 |
| --- | --- | --- | --- |
| M1 | M | sync 的目标上下文在开始时一次性计算：同一次 sync 中「刚完成任务的奖励」不会反馈给后续任务的 `lingyun` 类目标 | 接受：境界/物品/秘境进度不因发奖变化；`lingyun` 目标按 sync 前快照判定，语义稳定 |
| M2 | M | 发奖跨 characters + wallets + essence_inventory 三处非原子 | **改进设计**：先写完成（`rewards_granted=false`）→ 发奖 → 置 true；中途失败下次 sync 补发（不丢奖）；仅「发奖成功但置位失败」存在极小重复窗口 |
| M3 | M | `own_items` 统计所有状态的物品（含 equipped） | 有意（持有即算），描述为「持有」 |
| L1 | L | 无状态目标无法表达「累计击杀 N」等计数目标 | 顺延 P6.2 事件计数 |
| L2 | L | 其他接口不自动调用 quest/sync，需客户端在关键动作后调用 | 文档化；P6.2 改服务端事件钩子 |
| L3 | L | 对话文本仅存储与详情返回，无演出 | 顺延 |
| L4 | L | BIGINT（灵韵/灵石/玉简）→ Number 精度债 | 继承登记 |

## 2. 关键正确性核对

- **触发**：新角色仅 `q_ch1_1` active（realm1、无前置）、其余 locked；locked 任务仍返回目标进度（`q_ch2_3` 的 learn_skills/own_items 显示 current=0）。
- **只读**：`GET /quests`、`GET /quests/:code` 不写库；未知 code → QUEST_NOT_FOUND。
- **幂等发奖**：首次 sync 完成 q_ch1_1，灵韵 100 / 灵石 +500（10000→10500）；再次 sync completedCount=0 且数值不变（无重复发放）。
- **级联**：升 2 境后一次 sync 连续完成 q_ch1_1 + q_ch1_2（玉简 +1）；q_ch2_1 在 realm3 仍 locked（realm 门），realm4 后完成（灵石 +2000）。
- **目标型**：青云山脚 best≥3（3 次挑战）后 q_ch1_3 完成，奖励通货 transmute×2 入 wallet（`GET /currencies` owned=2）。
- **落库**：characters（灵韵/灵石/玉简）一次 UPDATE；wallet/essence upsert 幂等。
- **数据规模**：24 张表；quest defs 12；`rewards_granted` 列（幂等补发）+ 引用孤儿校验（前置/后续/进度）已入 init 脚本。

## 3. 验证命令与结果

```bash
pnpm --filter ./packages/server typecheck    # exit 0
pnpm --filter ./packages/server build         # exit 0
pnpm --filter ./packages/server db:init:game  # 24 张表；quest defs 12
# 冒烟：25 断言 ALL P6 SMOKE PASSED（触发/只读/幂等/级联/目标型/奖励落库）
curl -s localhost:3000/api/health             # 200 {"status":"ok"}
```

## 4. 结论

无 H 级缺陷；M2 的发奖流程已按「可重试不丢奖」重设计并实测幂等；M1/M3 与 L 级明确归属。P6 可提交。
