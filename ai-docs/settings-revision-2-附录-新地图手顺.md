# 14 · 怎么定义一张新地图（青云宗实践样板）

> 本文是**操作手顺**，不是设计文档。设计依据在 `settings-revision-2.md`
> （§5 地图线路图与传送点 / §6 战斗结算 / §7 青云宗 / §7.0 世界结构）。
> 青云宗（`map_qingyun`）是第一个按此流程落地的图，**它就是样板**：照它做即可。

---

## 0. 先想清楚世界归属

本作是**三千大世界**，每个大世界由**一个大宗门**统治；**第十境**才出大世界进混沌海
（R2 §7.0）。所以定义一张图之前先回答两个问题：

1. 它属于哪个**大世界**？→ 写进 `maps.json` 的 `world`（青云宗 = `world_qingyun`）。
2. 它覆盖**哪几章的剧情**、把玩家**历练到第几境**？→ 决定 `chapterFrom/chapterTo` 与全图 `level` 上限。
   （青云宗：第 1~2 章、历练到**第五境**。）

---

## 1. 画线路图（在构思文档里，不是先写代码）

参考 `user-docs/青云宗地图构想.md` 的**四层同心范式**（外环山门 → 八峰 → 内环功能 → 中央主峰）。
它的三个好处值得沿用到下一张图：**拓扑天然有分支**（不是单行道）、**传送阵是结构自带的**、
**节点是「地点宿主」**（承载系统，未实现的系统不至于阻塞地图层落地）。

每个节点要先定这 6 件事：

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `level` | 1~14 | **怪物境界，固定不变**（不随层数上涨） |
| `threshold` | > 0 | 固定战力门槛，判定 `playerPower ≥ threshold` |
| `kind` | `route` / `secret_realm` / `summit` | **没有 `idle_spot`**（见 §3） |
| `feature_key` | 见 §5 | 该地点承载的系统；`null` = 纯跑图 |
| `has_waypoint` | 布尔 | 首次到达即点亮，之后可从任意已点亮处直达 |
| `requires_node_code` | code 或 null | 解锁前置；`null` = 入口节点（图上初始可见） |

---

## 2. 数值规则（照抄青云宗的排法）

- **门槛一律 ≤「同境界裸装战力」**：`playerPower = 境界 × 20`（权重见
  `APP_CONFIG.zonePower`：`realmWeight 20 / equipWeight 5 / skillDivisor 2`）。
  这样**境界到了就能推进地图**，把「卡关」留给该图的压轴秘境，而不是撒在路上。
- **全图 `level` 不超过该图的境界天花板**（青云宗 = 5），门槛不超过 `天花板 × 20`。
- 青云宗的实测节奏（可作标尺）：

| 境界 | 1 境 | 2 境 | 3 境 | 4 境 | 5 境 |
| --- | --- | --- | --- | --- | --- |
| 裸装战力 | 20 | 40 | 60 | 80 | 100 |
| 可进入节点 | 3/27 | 6/27 | 9/27 | 17/27 | **27/27** |

---

## 3. 秘境：每图 0~1 个，且它是**唯一的挂机处**

> 用户定调（D9）：**挂机只能在「历练秘境峰」**，地图上不散布挂机点。

- `kind='secret_realm'` 的节点用 `zone_code` 指向 `game_zones.code`；**每图最多 1 个**（D8）。
- 秘境产出（刷什么怪、掉什么）由 **`game_zones.unit_code` / `boss_code`** 决定，
  **地图节点不持有产出单位**（`game_map_nodes` 没有 `unit_code`）。
- **0 个秘境的地图是合法的** —— 但它**没有挂机处**，玩家得回上一张图的秘境挂
  （所以秘境要允许回访）。
- 秘境层数与 Boss（D8 / D2）：`maxFloor ≤ 3`、`bossEveryFloors = 3`（第 3 层即 Boss 层）。
  **击败首个 Boss 才解锁离线挂机**（`idle_unlocked`）。
- 数值要求：让「**下一境的裸装战力刚好能破第 3 层 Boss**」——
  青云宗三层门槛 `75 / 87 / 99`：4 境裸装（80）可进第 1 层开始历练，
  第 3 层（99）≤ 5 境裸装（100）→ 循环闭合（4 境刷 → 破境到 5 境 → 破 Boss → 解锁挂机）。

---

## 4. 落地六步

```bash
# 1) 填种子：编辑 packages/server/scripts/gen-map-seed.mjs 的 NODES / EDGES / ZONE_BY_NODE / maps
# 2) 若有秘境：同步在 prisma/seeds/game/zones.json 加一条（maxFloor<=3, bossEveryFloors=3）
# 3) 生成（末尾自检会拦住绝大多数结构错误）
pnpm --filter idle-path-server run gen:map-seed

# 4) 落库（幂等；玩家进度表不动）
pnpm --filter idle-path-server run db:init:game

# 5) 第二道网：种子不变量（23 条，纯读 JSON，不连库）
pnpm --filter idle-path-server exec tsx --test "test/modules/map-seed.test.ts"

# 6) 端到端（起服务后跑；tmp/map-e2e.mts 可作起点）
pnpm --filter idle-path-server run verify
```

---

## 5. UI 一般不用改；只有新 `feature_key` 才要登记

地图面板是**通用**的：线路图（按 `ring` 分组）+ 节点卡（境界/门槛对比/三态）+ 三态徽标 +
`FeatureGate`「未开放」。**新增一张图不需要写任何前端代码。**

唯一例外：出现了**新的 `feature_key`** 时，去
`packages/web/src/pages/game/panels/map/feature-registry.ts` 登记它对应哪个域；
**不登记 = 显示「未开放」**（这是刻意的：`feature_key` 是数据，「系统做了没」是代码事实，
写进数据库会让种子随实现进度腐烂）。

当前已登记：`skill` → 功法 / `craft` → 炼器 / `quest` → 任务 / **`waypoint` → 地图自身**。
尚未实现（显示未开放）：`farm` / `alchemy` / `beast` / `pvp` / `discipline` / `profession`。

---

## 6. 会被自动拦住的错误（不用人肉记）

`test/modules/map-seed.test.ts` 的 23 条断言覆盖：

- **引用完整性**：节点↔地图↔秘境↔边 的悬空引用；秘境必须指向真实 zone 且**非秘境节点不得带 zoneCode**；
- **D8**：每图 0~1 秘境、大世界内秘境 `max_floor ≤ 3`；
- **D2 前提**：秘境必须 `bossEveryFloors > 0` 且 ≤ `maxFloor`（否则「击败首个 Boss」永远无法成立）；
- **D9**：不得出现 `idle_spot` 节点、地图节点不得自带产出单位；
- **门槛自洽**：`level ∈ 1~14`、`threshold > 0`、节点章节落在所属地图章节区间内、
  同图 `orderIndex` 不重复、**解锁链无环**、**全图从入口可达**；
- **迁移债**：未归属地图的遗留秘境集合（清理后请删该用例）。

建库脚本里另有**同口径的悬空引用自检**（map / requires_node_code / zone_code 三处），
写完即报错 —— 这几道网在青云宗落地时各抓到过真错。

---

## 7. 已知坑

1. **遗留 5 秘境**（`zone_qingyun` / `zone_miwu` / `zone_guhai` / `zone_dajie` / `zone_hundun`）
   目前**没有地图节点**，后端离线闸门对它们 `enforced=false`（保持旧行为）。
   **把新图的秘境接进地图时，不要顺手改动它们**；等它们被正式重新归属后，
   再删掉 `map.service.ts` 里 `zoneIdleGate` 的过渡分支 + 那条迁移债用例。
2. **掉落表命名过期**：`dt_band1..5` 的名字还是旧章节名（「第一章·初入仙途」等），
   R2-5 已改章名，这批名字待内容轮一并重命名。
3. **七职业峰的七个职业仍是待定**（`feature_key: 'profession'`）——
   职业与既有功法/道基流派的关系未定（R2 §7.7），定之前不要接进功法域。
4. **地图没有「当前节点」持久化**：`map.enter` 只写 `visited`，`currentCode` 是**会话内**位置。
   若要让 HUD 显示「当前所在节点」，需要一次表结构决定。
5. **D4（章节完成 → 解锁下一张地图）尚未接线**：当前只有 1 张图，判定是空操作；
   等地图形 2/3 定义完再接（`game_maps.requires_map_code` + `chapter_to` 已具备判定依据）。
