# P2 代码审阅报告 — 功法体系（自动审阅）

> 审阅日期：2025-09-12（编码完成后自动执行）
> 审阅对象：`src/modules/game/skill/*`、`src/common/{config,services}`、`scripts/init-game-db.mjs`、`prisma/seeds/game/skills.json`、P2 改造点（characters/service/main/app.module/game.module/item.service）
> 审阅方式：静态走查 + 动态探测（含并发与跨端点）+ DB 一致性核验 + 断言回归
> 结论：**审阅中发现 4 处缺陷（1 处漏洞级）已即时修复并复验通过；P2 可验收。**

---

## 一、审阅发现并即时修复的缺陷

| 编号 | 级别 | 缺陷 | 修复 | 复验 |
| --- | --- | --- | --- | --- |
| F1 | M（计划偏差） | 「共用限流额度」未落实：ItemService 与 SkillService 各持独立限流 Map，实际 10 次/分而非 5 | 抽取共享 `RateLimiterService`（单 Map/单窗口），generate / lingyun-grant / jade-grant 全走同一额度 | 跨端点实测：3 generate + 2 grant 后第 6 次 dev 调用 → RATE_LIMITED ✅ |
| F2 | M（SAGA 缺口） | `learn` 的 INSERT **异常路径**无玉简补偿（仅并发冲突路径有），game 库故障会吞玉简 | INSERT 包 try/catch，失败退还玉简后重抛；并发冲突路径保留 ON CONFLICT + 退还 | 并发双 learn 实测：1 成功 + 1 ALREADY_LEARNED，玉简净扣恰 1 ✅ |
| F3 | H（漏洞） | `putPanel` 结构校验 `typeof body !== 'object'` 漏掉数组（`typeof [] === 'object'`）——**数组体会被当作空面板成功写入** | 显式 `Array.isArray(body)` 拒绝 → SLOTS_INVALID | PUT `[1,2]` → SLOTS_INVALID ✅ |
| F4 | L（体验） | generate 的越权尝试在限流计数**之前**消耗额度（无效请求烧配额） | 归属校验前置于限流 | 越权 FORBIDDEN 不占额度 ✅ |

## 二、登记的中低优先级项

| 编号 | 级别 | 项 | 处置 |
| --- | --- | --- | --- |
| L1 | L | putPanel 对数组内非字符串/空串元素 lenient 静默丢弃（契约未禁止） | 可接受，观察 |
| L2 | L | enlighten 的灵韵不足提示使用 resolveCharacter 时快照（并发下文案可能旧，扣减本身原子正确） | 观察 |
| L3 | M | 跨库（users↔game）无分布式事务：SAGA 补偿已覆盖冲突与异常，但两库操作间进程崩溃仍留极小不一致窗口 | 建议 P2.5+ 增加对账/幂等重放任务 |
| L4 | M | 限流器为单实例内存实现，多进程/多副本部署不共享 | 水平扩容前必须外置（Redis） |
| L5 | L | 继承债：BIGINT（lingyun/jade/slots id）经 Number()，P2 量级安全 | P4 前处理 |

## 三、验证记录（本次审阅复验）

| 项 | 结果 |
| --- | --- |
| typecheck / build | ✅ 零错误 |
| 建库：9 张表 + skills 9 部（显式 id 1~9）+ 无漂移告警 | ✅ |
| 修习链：grant→learn×9→幂等 ALREADY_LEARNED→JADE_NOT_ENOUGH | ✅ |
| 并发 learn：净扣 1 枚玉简 | ✅ |
| 面板：装配（神识 60/100）→ 超预算 140 → DUPLICATE_SLOT → SLOT_COUNT_EXCEEDED → SKILL_NOT_FOUND → SLOTS_INVALID（含数组体） | ✅ 6 类全过 |
| 参悟：1→2 耗 100；2→3 需 200 不足；LINGYUN_NOT_ENOUGH 提示精确 | ✅ |
| 协同：主心法=剑 → shufa_jianqi matched=true，其余 false | ✅ |
| 图鉴：learned/level/effectsTexts 正确（青云心法 2 级 → 攻击加成 4.2%） | ✅ |
| 共享限流：第 6 次 dev 调用 RATE_LIMITED | ✅ |
| 未认证 401（全局 Guard） | ✅ |
| /api/health | ✅ 200（DB+Redis up） |

## 四、值得肯定

1. 跨库一致性采用「原子扣减（WHERE 守卫）+ 失败补偿」SAGA，learn/enlighten 两条链路补偿齐全；
2. 面板校验链顺序合理（结构→重复→数量→存在→类型→已修习→神识预算），错误码与契约逐一对齐；
3. 种子显式 id + 序列 setval + learned 孤儿告警，延续 P1 防漂移模式；
4. 全部 SQL 参数化；dev 工具三接口均带生产守卫与共享限流。

## 五、结论

H 级（F3）与 M 级（F1/F2）已修复复验，L/M 级登记待排期。**P2 通过自动审阅，可提交合并。**
