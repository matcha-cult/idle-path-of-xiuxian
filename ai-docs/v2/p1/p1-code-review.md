# P1 代码审阅报告 — 物品与词缀系统

> 审阅日期：2025-09-12
> 审阅对象：`src/modules/game/*`、`prisma/schema.prisma`、`scripts/init-*.mjs`、`prisma/seeds/game/*` 及 P1 改造点（character/main/app.module/database）
> 审阅方式：静态代码走查 + 种子/契约程序化交叉核验 + typecheck 复验 + 只读 DB 核对（未改动任何代码与数据）
> 结论：**核心链路实现正确、与设计文档高度一致，可作为 P1 收尾，但存在 2 个高优先级缺陷建议修复后再合并：词缀族去重已失效（正则笔误），以及 generate 开发接口无归属校验的滥用面。**

---

## 一、高优先级（建议修复后再合入）

### H1 词缀「族去重」正则笔误 —— 去重逻辑完全失效

- 位置：`packages/server/src/modules/game/item/item.affix.service.ts:52-53`
- 代码：`private familyOf(code: string): string { return code.replace(/_d+$/, ''); }`
  （正则字面量应为 `/_\d+$/`，实际匹配「下划线 + 一个以上字母 d」的结尾）
- 证据（已程序复现）：种子 code 形如 `aff_atk_1` … `aff_atk_14`（尾部为数字），
  `familyOf('aff_atk_1')` → `'aff_atk_1'`，T 阶后缀从未被剥离。
- 后果：`sampleAffixes` 的「同族不放回」过滤（同文件 :79-80）实际只排除了刚抽中的那一条 code，
  **同族不同阶的词缀（如「锋锐 T5」+「锋锐 T3」）可以同时 roll 到同一件物品上**，
  违反代码注释、交付报告 §2「族去重加权抽样」及计划 §5.6「同一 affix code 不重复出现」的意图。
- 未暴露原因：T1 窗口 [1,1] 每族只有 1 行、库内仅 2 件生成样品（已只读核对无重复族）——
  属潜伏缺陷，T2+ 窗口（窗口 ≥2 阶）即会实际触发。
- 建议：改为 `code.replace(/_\d+$/, '')`。修复后 `base_fengmang` / `leg_*` 等无尾数字词缀不受影响，行为符合注释语义。

### H2 生成接口（开发/测试）滥用面：越权注入他人角色 + GET 写操作 + 无限量生成

- 位置：`packages/server/src/modules/game/item/item.controller.ts:85-110`（GET+POST）、`item.affix.service.ts:generateItem`
- 问题：
  1. **characterId 无归属校验**：任意已登录用户可传任意 `characterId`，为他人角色生成物品直接落入对方背包
     （character_id 自增可遍历），也可生成无主/指向不存在角色的孤儿行——污染他人数据。
  2. **GET 承载写操作**：`@Get('item/generate')` 注释自述「浏览器直访方便调试」；GET 在语义、缓存、预取层面不该有副作用。
  3. **无任何数量/速率限制**：可循环刷爆 `game_items`（存储型 DoS）。
- 契约已明示「开发/测试」，但代码层没有任何门禁。建议三选一：`NODE_ENV !== 'production'` 守卫、
  characterId 强制归属校验（或仅允许本人/`null`）、删除 GET 变体。

---

## 二、中优先级

### M1 `generateItem` 未做 rarity 白名单校验

- 位置：`item.affix.service.ts:139`（只挡上界 `Number(rarity) > base.rarity_limit`）
- `rarity = -1`（或 0~3 之外且 ≤ rarityLimit 的值）可通过检查，随后所有分支未命中 →
  落库为非法 rarity 的 0 词缀物品，message 渲染 `RARITY_NAMES[-1]` → `生成成功：X（undefined）`。
- 建议：`![0,1,2,3].includes(rarity)` 直接返回 `INVALID_PARAM`。

### M2 非法/缺失参数产生 NaN 直达 SQL → HTTP 500，而非受控失败

- 位置：`item.controller.ts:22-26`（`toInt` 以 NaN 为 fallback 时原样返回 NaN）
- 触发面：`GET /inventory/:id` 传非数字、`POST /item/{equip,unequip,discard}` 缺 `itemId`/传非数字、
  `?rarity=abc`、`?tierMin=abc`。
- 链路：`WHERE i.id = $1`（bigint）/`i.rarity = $1`（smallint）收到 `'NaN'` → PostgreSQL 22P02 → Nest 500。
- 建议：统一在控制器或服务入口加 `Number.isFinite` 校验返回 `INVALID_PARAM`（page/pageSize 用有限 fallback，无此问题）。

### M3 `db:init:game` 再灌种子会删除玩家数据 + 存量物品 id 漂移风险

- 位置：`scripts/init-game-db.mjs:128`（`DELETE FROM game_pickup_rules` 无条件清表）
- 1) 拾取规则 CRUD 已对玩家开放，重复执行 `db:init:game` 会把 `character_id>0` 的**玩家自建规则一并删除**。
  预置模板（character_id=0）应用 UPSERT，玩家行保留。
- 2) `game_items` 虽被保留，但 bases/affixes 清空 + 序列归零；当前 id 由文件顺序确定性重建所以「碰巧稳定」，
  一旦未来在种子中间插行，存量物品 `base_id` / JSON 内 `affixId` 会**静默错位**（无外键、无校验）。
  建议种子固定显式 id 或引入 seed 版本迁移。

### M4 装备栏首次创建的并发竞态

- 位置：`item.service.ts:161-176`（`SELECT ... FOR UPDATE` 查空后 `INSERT INTO game_equipment`）
- 同一角色并发首次装备两件不同物品：两事务都查不到行 → 第二个 INSERT 撞 `character_id UNIQUE`（23505）未捕获 → 500。
  同一物品并发已被 `FOR UPDATE` 正确串行化，仅此窄窗口。
- 建议：`INSERT ... ON CONFLICT (character_id) DO NOTHING` 后再查/锁行，或捕获 23505 重读。

### M5 N+1 查询（P4 掉落量级前需处理）

- `inventory` 渲染每件物品单独 `findAffixesByIds` 一次请求（`item.service.ts:toViews` + `renderItem`），
  `pageSize≤100` 时最坏 101 次查询/请求；`bases?withPool=1` 同样逐基底查池摘要。
  P1 无压力可接受，建议后续批量查询（`ANY` + Map 分发），否则掉落/离线结算阶段必成瓶颈。

---

## 三、低优先级

- **L1 容错不一致**：`unequip` 的 `JSON.parse(slots)`（`item.service.ts:241`）无 try/catch，
  而 `equip`（:168）与 `equipment` 视图（:296）都有；slots 列损坏时仅 unequip 路径 500。
- **L2 文档/契约偏差**（其中 ②③④ 未在交付报告偏差表中记录）：
  - ① 契约 §3.2 要求详情 `affixes` 为 `[{pol,code,name,tier,value}]`，实输出存储形态 `{affixId,value,polarity,key}`，缺 code/name/tier（报告仅记录了「追加 key」一项）。
  - ② equip 成功 message 缺物品名（契约示例「装备成功：青锋剑 已佩戴至 weapon」vs 实现「已佩戴至 weapon」）。
  - ③ `game_affixes.value_func` 新列未出现在计划 §5.2 字段表中（合理扩展，但应在交付报告偏差表补一行）。
  - ④ seed 规格示例 code `aff_atk_01`（补零）与实际 `aff_atk_1` 不一致——纯文档层，但任何按 01 前缀做字符串排序/匹配的代码会踩坑。
  - ⑤ `packages/server/README.md` 仍是双库旧文案（`USER_SERVICE_DATABASE_URL`、「用户系统独立新建数据库」）、
    无 `db:init:game` 与 game 接口表——与合并单库决策矛盾（根 README 已更新）。
- **L3 配置校验缺位**：`AFFIX_TIER_WINDOW`（`item.affix.service.ts:20`）模块加载期 `Number(env)`，
  非法值 → `Math.max(1, NaN)` 进入 SQL → generate 全部 500；建议启动期校验整数 ≥ 0。
- **L4 BIGINT→Number 精度**：`lingyun`/`spirit_stones` 经 `Number()`（`character.service.ts:toCharacter`、`ItemRow.id`），
  超 2^53 丢精度；P2 灵韵量级上来后需改 string/BigInt 处理。
- **L5 随机源混用**：`randomInt` 用 `node:crypto`，`weightedPick`/`rollEntry` 用 `Math.random`——游戏数值无碍，可选统一。

---

## 四、观察项

- **O1 双 Pool 连同一库**：合并单库后 `DatabaseService` 与 `GameDatabaseService` 各自建池连同一 `DATABASE_URL`。
  无功能错误，但连接翻倍、且二者间无法开跨服务事务（P2 突破/装备校验若要跨 users↔game 表事务会受限）。
  可考虑后续合并或显式声明边界。
- **O2 P1 全部工作未提交**：`git status` 显示 P1 全部产物（game 模块、seeds、schema、scripts、README 等）仍为未追踪/未暂存，
  `git log` 最新提交仍是 P0 时代（09-11 01:01）。交付报告日期 9-11 但无对应 commit/tag，建议落地为可追溯提交。
- **O3 系统预置拾取规则对用户不可见**：`GET /pickup-rules` 只查 `character_id=$1`，预置模板（0）永不返回，
  新角色规则列表为空。契约未定义该行为、复制时机在 P4——可接受，建议在 API 文档补注一句。
- **O4 无外键设计**：`game_items.base_id`、`character_id` 无 FK 属有意为之（便于重灌），
  但配合 M3 的 id 漂移风险，建议至少在 seed 变更时做一致性校验脚本。

---

## 五、验证记录（本次审阅复验）

| 项 | 结果 |
| --- | --- |
| `pnpm --filter idle-path-server typecheck` | ✅ 零错误 |
| 种子结构：42 基底（14 境 × 3）/ 175 词缀（168 roll + 4 基底 + 3 传奇）/ 3727 池行 / 1 预置规则 | ✅ 程序化计数一致，且 live DB（35432）只读核对与交付报告完全一致（items=2 为冒烟残留） |
| 42 件基底 `baseStats` 对照 seed 规格公式（单手 8+6t / 双手 14+10t / 防具 / 首饰等） | ✅ 程序化核验 0 偏差 |
| 权重规则 `ceil(120/t)`（T1=120 … T14=9） | ✅ 抽查一致 |
| 词缀效果键 vs `EFFECT_LABELS`/`PERCENT_KEYS` 覆盖（含新增 atk_pct 等） | ✅ 无缺失键 |
| 池展开数核算（14×7×14 + 16×6×14 + 12×6×14 + 3 = 3727） | ✅ 与库一致 |
| `is_fractured=true` 行数 | ✅ 0（符合 P1 不配天定） |
| 事务/行锁、SQL 参数化、归属与境界校验链路 | ✅ 走查通过（见 H2/M4 两点例外） |
| `familyOf` 族去重 | ❌ 失效（H1，已用种子码复现） |

---

## 六、值得肯定的实现

1. **种子-文档一致性执行到位**：基底公式、词条数规则（灵品 1~2 前≤1 后≤1 / 宝品 3~6 前≤3 后≤3）、−N 窗口、传奇固定词缀路径均与 `p1-seed-spec.md`、`p1-implementation-plan.md` §5.6 对应，且经程序核验。
2. **交付报告 §3 偏差决策记录**规范（5 条均有理由与回退口径），HTTP 200 + `data.code` 风格与项目既有接口保持一致，无风格分裂。
3. **并发正确性意识良好**：equip/unequip/discard 全程事务 + `FOR UPDATE` 行锁，归属/状态/境界校验顺序合理。
4. **SQL 全部参数化**，无注入面；JSON 字符串列的 `parseJson/tryParse/safeParse` 容错覆盖面较全。
5. 细节正确：戒指 ring1→ring2 自动分配与 `SLOT_OCCUPIED`、`TIER_TOO_HIGH` 对境界 realm 的校验、分页上限 100、pickup-rule 输入的 clamp 与 action/affixCodes 白名单规范化、`.devdb` 入 `.gitignore`、`main.ts` 补 `dotenv/config`（修复了此前冒烟靠默认 5432 巧合通过的问题）。

---

## 七、处置建议

| 级别 | 项 | 建议 |
| --- | --- | --- |
| 高 | H1 族去重正则 | 一行修复，随本报告立即修 |
| 高 | H2 generate 门禁 | 环境守卫 + 归属校验，随本报告立即修 |
| 中 | M1~M4 | 随 H 一并处理或登记为 P2 前置技术债 |
| 中 | M5 N+1 | 登记至 P4（掉落量级）前处理 |
| 低/观察 | L1~L5、O1~O4 | 按需排期，不阻塞 P2 |

> H1/H2 修复后即可视为 P1 验收通过，可进入 P2（功法体系）。
