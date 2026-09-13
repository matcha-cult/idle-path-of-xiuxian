# 07 · 后端 API 面清单（逐字段 · 供前端 typed API/DTO 层）

> 分析对象：`packages/server`（NestJS + ionet-ts）只读体检，**未修改任何源码**。
> 基线：工作区当前 HEAD；行号引用格式 `文件:起-止`，均指 `packages/server/` 下相对路径。
> 口径：所有「成功 data」都指响应信封 `data` 字段内的对象（对 Action：即 Action 返回值；对 REST：即 HTTP body 顶层对象本身）。
> 唯一例外：`system.ping` 不遵守 `{success,message}` 约定（见 §2.1）。

---

## §0 线协议与结果信封（前端统一收口）

### 0.1 WS 请求信封

| 字段 | 类型 | 必填 | 说明 | 出处 |
|---|---|---|---|---|
| `cmd` | number | 是 | 逻辑服段号，见 §4 | `src/ionet/cmd.ts:22-51` |
| `subCmd` | number | 是 | 段内路由号，从 1 起，0 保留 | `src/ionet/cmd.ts:4-5` |
| `data` | object | 否 | 业务参数；受保护 Action 需连接已鉴权 | `src/ionet/action-support.ts:60-63`（`dataOf`） |
| `reqId` | string | 否 | 请求配对 id，服务端原样回显 | `ai-docs/ws-protocol-contract.md:20-31` |

### 0.2 WS 响应信封（由框架 `BarSkeleton.execute` 产出）

| 字段 | 类型 | 出现条件 | 出处 |
|---|---|---|---|
| `data` | object | 成功时 = Action 返回值 | `ai-docs/ws-protocol-contract.md:33-46` |
| `errorCode` | number | 仅在框架层失败出现（400 报文非法 / 404 路由不存在 / 500 未捕获异常） | 同上 |
| `errorMessage` | string | 同上 | 同上 |
| `reqId` | string | 仅当请求带 `reqId` | 同上 |
| `kind` | `'response' \| 'notification'` | 仅新协议路径（带 `reqId`）出现；旧请求逐字节不变 | 同上 |

**关键：业务失败不占 `errorCode`**。Action 一律返回 `{ success:false, message:string, data:{ code:string } }`，`errorCode` 仍为 0/省略，前端必须检 `data.success`。定义见 `src/ionet/action-support.ts:9-28`。

### 0.3 Action 统一结果形状

```ts
// 成功（各业务自定义 data）
type ActionOk<T> = { success: true; message: string; data?: T };
// 失败（全仓库统一）
type ActionFail = { success: false; message: string; data: { code: string } };
// 出处：src/ionet/action-support.ts:9-28、src/common/kernel/result.ts:12-21
```

> 注意：`ActionOk.data` 在类型上是可选（`data?`），但**本清单标记的成功 data 均为实测存在的字段**；
> 唯一确认「成功但无 data」的 Action 不存在（所有 service 成功分支都带 data）；`system.ping` 例外（返回裸对象）。

### 0.4 REST 信封（与 WS 不同！）

NestJS 直接返回 service 结果对象，**不再二次包封**；`app.setGlobalPrefix('api')` 统一前缀。

- 成功：HTTP 200 + `{ success:true, message:string, data:{...} }`
- 业务失败：**HTTP 200** + `{ success:false, message:string }`（无 `data`）
- 鉴权失败：HTTP 401 + NestJS 默认体 `{ statusCode:401, message:'登录状态无效，请重新登录', error:'Unauthorized' }`（`UnauthorizedException`，`src/common/guards/jwt-auth.guard.ts:32,38`）
- health：**裸报告体**，非 `{success,message}` 信封（`src/modules/health/health.controller.ts:19-31`）
- 全局路由：`src/main.ts:24`；全局 Guard：`src/app.module.ts:85-90`

---

## §1 REST 清单（7 个 endpoint）

> 前缀：`/api`。除标注 `@Public` 外全部需 `Authorization: Bearer <jwt>`。

### 1.1 POST `/api/auth/register`（@Public）

| 请求体字段 | 类型 | 必填 | 默认 | 校验/出处 |
|---|---|---|---|---|
| `username` | string | 是 | — | trim 后 3–50 字符（`auth.service.ts:39-45`）；非 string → 视为 `''`（`auth.controller.ts:23`） |
| `password` | string | 是 | — | 长度 ≥ 6（`auth.service.ts:46-48`） |

**成功响应 data（已确认含 token 与 user）** `auth.service.ts:35-74`

| 字段 | 类型 | 出处 |
|---|---|---|
| `token` | string（JWT，默认 604800s 过期） | `auth.service.ts:67,72`；`common/auth/jwt.ts:17-23` |
| `user.id` | number | `auth.service.ts:72` |
| `user.username` | string | 同上 |

**失败形状**：`{ success:false, message:string }`，无 `data`。可能 message：`'用户名不能为空'` / `'用户名长度需在 3-50 个字符之间'` / `'密码至少6个字符'` / `'用户名已存在'`（`auth.service.ts:40-56`）。

### 1.2 POST `/api/auth/login`（@Public）

请求体同 register（`auth.controller.ts:28-33`）。

**成功响应 data** `auth.service.ts:76-110`：`{ token: string; user: { id: number; username: string } }`（行 108）。

**失败**：`{success:false,message}` — `'用户名和密码不能为空'` / `'用户名或密码错误'`（行 82,93,98）。

### 1.3 GET `/api/character/check`（需 JWT）

无请求体。

**成功 data**（`character.service.ts:65-75`）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `character` | `Character \| null` | 无角色为 null，结构见 §5.7 |
| `hasCharacter` | boolean | 恒为 `true`/`false` 与 character 同步 |

service 恒返回 `success:true`（无角色也是成功）。

### 1.4 POST `/api/character/create`（需 JWT）

| 请求体字段 | 类型 | 必填 | 默认 | 校验 |
|---|---|---|---|---|
| `nickname` | string | 是 | — | controller 非空（`character.controller.ts:32`）；service trim + ≤50 字符（`character.service.ts:91-97`） |
| `gender` | string | 是 | — | 仅 `'male'` / `'female'`（`character.controller.ts:35`） |

**controller 级失败**（HTTP 200，`{success:false,message}`）：`'昵称和性别不能为空'`、`'性别参数错误'`（`character.controller.ts:32-37`）。

**成功 data**：`{ character: Character; hasCharacter: true }`（`character.service.ts:107-114`）。

**service 失败**：`{success:false,message}` — `'角色数量已达上限（1）'` / `'已存在角色，无法重复创建'` / `'角色昵称不能为空'` / `'角色昵称最长50字符'`（`character.service.ts:84-97`）。

### 1.5 GET `/api/character/info`（需 JWT）

**成功 data**：`{ character: Character; hasCharacter: true }`（`character.service.ts:122-130`）。

**失败**：`{success:false, message:'角色不存在'}`（行 119-121）。

### 1.6 GET `/api/health` / 1.7 POST `/api/health`（@Public）

无请求体，**返回裸报告**（非信封）；HTTP 200 = `status:'ok'`，任一依赖 down → 503 `'degraded'`（`health.controller.ts:19-31`）。

| 字段 | 类型 | 出处 |
|---|---|---|
| `status` | `'ok' \| 'degraded'` | `health.service.ts:73-81` |
| `timestamp` | string（ISO） | 同上 |
| `uptimeSeconds` | number | 同上 |
| `checks.database.status` | `'up' \| 'down'` | `health.service.ts:15-19,50-58` |
| `checks.database.latencyMs` | number | 同上 |
| `checks.database.error?` | string | 仅 down 时 |
| `checks.redis.*` | 同 database 结构 | `health.service.ts:60-71` |

单检超时 2000ms（`health.service.ts:13`）。

---

## §2 WS Action 清单（共 46 个 Action / 12 段）

> 登记表：`src/ionet/game-actions.ts:38-51`。Action 只做参数解析 + 调门面，业务在 `*.logic.service` / `internal/*.service`。
> 请求字段类型规则：`toFiniteInt` 接受「number 或数字字符串」，`Math.floor`，非法→undefined（`action-support.ts:54-58`）。
> 未特别标注时，所有 Action 均可能返回 `UNAUTHORIZED`（`requireUserId` 未过，`action-support.ts:41-44`）与 `CHARACTER_NOT_FOUND`（service 解析角色失败）。

### 2.1 system 段（cmd 1）

| subCmd | 方法 | 请求 data | 成功 data | 失败码 | 出处 |
|---|---|---|---|---|---|
| 1 `ping` | `HealthAction.ping` | 无参 | **裸对象** `{status:'ok', service:'idle-path-of-xiuxian', timestamp:number}`（**无 success/message 包装**） | 无 | `health.action.ts:14-21`；白名单 `cmd.ts:168-170` |

> `system.ping` 是唯一免鉴权 Action（`PUBLIC_ACTION_KEYS`，`cmd.ts:168-170`）；启用 WS 握手鉴权后所有连接已鉴权（`app.module.ts:66-73`）。

### 2.2 item 段（cmd 30）

| subCmd | 方法 | 请求 data（名/类型/必填/默认） | 成功 data | 失败码 | 出处 |
|---|---|---|---|---|---|
| 1 `inventory` | `inventory` | `category?:string`；`rarity?:int`；`tierMin?:int`；`tierMax?:int`；`page?:int`=1；`pageSize?:int`=20 | `{total:number, page:number, pageSize:number, items:ItemView[]}` | `CHARACTER_NOT_FOUND` | `item.action.ts:25-38`；`item.service.ts:114-163`（data:162） |
| 2 `inventoryDetail` | `inventoryDetail` | `id:int`（必填） | `{item: ItemView}` | `INVALID_PARAM`(id 非法)、`ITEM_NOT_FOUND`、`ITEM_NOT_OWNED` | `item.action.ts:40-47`；`item.service.ts:166-180` |
| 3 `bases` | `bases` | `category?:string`；`tier?:int`；`page?:int`=1；`pageSize?:int`=20；`withPool?:1\|'1'`（其余→0） | `{total:number, page:number, pageSize:number, bases:BaseView[]}` | 无业务码（公开图鉴） | `item.action.ts:49-62`；`item.service.ts:379-429`（data:428） |
| 4 `pickupRuleList` | `pickupRuleList` | 忽略 | `{rules: PickupRuleView[]}` | — | `item.action.ts:64-69`；`item.service.ts:451-459` |
| 5 `pickupRuleCreate` | `pickupRuleCreate` | `name:unknown`(→string，必填非空)；`rarityMin?:unknown`；`tierMin?:unknown`；`affixCodes?:unknown`；`action?:unknown`；`enabled?:unknown`；`priority?:unknown`（规范化见 §2.2 注） | `{rule: PickupRuleView}` | `INVALID_RULE`、`CHARACTER_NOT_FOUND` | `item.action.ts:71-85`；`item.service.ts:461-478` |
| 6 `pickupRuleUpdate` | `pickupRuleUpdate` | `id?\|ruleId?:int`（至少其一）；其余字段同上，**部分更新**（undefined 保持原值） | `{rule: PickupRuleView}` | `INVALID_PARAM`(id 非法)、`PICKUP_RULE_NOT_FOUND` | `item.action.ts:87-103`；`item.service.ts:480-514` |
| 7 `pickupRuleDelete` | `pickupRuleDelete` | `id?\|ruleId?:int`（至少其一） | `{ruleId:number}` | `INVALID_PARAM`、`PICKUP_RULE_NOT_FOUND` | `item.action.ts:105-112`；`item.service.ts:516-528` |

> **2.2 注 · pickupRule 写入字段规范化**（`item.service.ts:633-647`，源头均为 `unknown`，故不臆测原始类型）：
> `name` 非空 string 才生效；`rarityMin` clampInt[0,3] 默认 0；`tierMin` clampInt[1,14] 默认 1；
> `affixCodes` 仅保留 string 元素、最多 50 条；`action` ∈ `'salvage'|'sell'|'discard'|'keep'`，否则 `'keep'`；
> `enabled` 仅 `=== false` 为 false，其余 true；`priority` clampInt[0,1000] 默认 100。
> 分页归一：`page∈[1, MAX_PAGE]`、`pageSize∈[1,100]`（`item.service.ts:24-37,121-122`）。

### 2.3 prop 段（cmd 40）

| subCmd | 方法 | 请求 data | 成功 data | 失败码 | 出处 |
|---|---|---|---|---|---|
| 1 `discard` | `discard` | `itemId:int`（必填） | `{itemId:number}` | `INVALID_PARAM`、`ITEM_NOT_FOUND`、`ITEM_NOT_OWNED`、`ITEM_NOT_IN_BAG` | `prop.action.ts:20-27`；`item.service.ts:317-340` |
| 2 `generate`（dev） | `generate` | `baseId:int`（必填）；`rarity:int`（必填）；`characterId?:int\|null` | `{item: ItemView}` | `INVALID_PARAM`、`FORBIDDEN`(生产禁用/越权)、`RATE_LIMITED`、`BASE_NOT_FOUND`、`RARITY_EXCEEDS_LIMIT`、`CHARACTER_NOT_FOUND` | `prop.action.ts:29-41`；`item.service.ts:85-111`；`item.affix.service.ts:135-204` |

> prop 段是 item 原语的薄封装（`prop.logic.service.ts:14-20`）。

### 2.4 equip 段（cmd 50）

| subCmd | 方法 | 请求 data | 成功 data | 失败码 | 出处 |
|---|---|---|---|---|---|
| 1 `equip` | `equip` | `itemId:int`（必填） | `{slot:string, slots: Record<EquipSlotKey, number\|null>}` | `INVALID_PARAM`、`ITEM_NOT_FOUND`、`ITEM_NOT_OWNED`、`ITEM_NOT_IN_BAG`、`TIER_TOO_HIGH`、`SLOT_OCCUPIED` | `equip.action.ts:21-28`；`item.service.ts:183-267`（data:265） |
| 2 `unequip` | `unequip` | `itemId:int`（必填） | `{slot:string, slots: Record<EquipSlotKey, number\|null>}` | `INVALID_PARAM`、`ITEM_NOT_FOUND`、`ITEM_NOT_OWNED`、`ITEM_NOT_EQUIPPED` | `equip.action.ts:30-37`；`item.service.ts:270-314`（data:312） |
| 3 `equipment` | `equipment` | 忽略 | `{slots: Record<EquipSlotKey, {id,name,rarity,tier}\|null>, equippedCount:number}` | — | `equip.action.ts:39-44`；`item.service.ts:343-376`（data:375） |

> 槽位键常量（10 个）：`weapon, body, helmet, gloves, boots, shield, ring1, ring2, amulet, belt`（`item.types.ts:9-20`）。
> 戒指自动落 `ring1`/`ring2`（`item.service.ts:232-235`）。

### 2.5 skill 段（cmd 60）

| subCmd | 方法 | 请求 data | 成功 data | 失败码 | 出处 |
|---|---|---|---|---|---|
| 1 `list` | `list` | 忽略 | `{skills: SkillCatalogView[]}`（§5.4） | — | `skill.action.ts:25-30`；`skill.service.ts:79-108` |
| 2 `learn` | `learn` | `skillId:int`（必填） | `{skillId:number, jadeSlips:number}` | `INVALID_PARAM`、`SKILL_NOT_FOUND`、`ALREADY_LEARNED`、`JADE_NOT_ENOUGH` | `skill.action.ts:32-39`；`skill.service.ts:111-162` |
| 3 `panel` | `panel` | 忽略 | `{panel: PanelView}`（§5.4） | — | `skill.action.ts:41-46`；`skill.service.ts:166-175,177-212` |
| 4 `panelUpdate` | `panelUpdate` | 整个 `data` 即载荷：`{xinfa?:{main?:string\|null, aux?:string[]}, shufa?:string[]}`（运行时规范化） | `{panel: PanelView}`（写后回读视图） | `SLOTS_INVALID`、`DUPLICATE_SLOT`、`SLOT_COUNT_EXCEEDED`、`SKILL_NOT_FOUND`、`NOT_LEARNED`、`SPIRIT_BUDGET_EXCEEDED` | `skill.action.ts:48-53`；`skill.service.ts:215-289` |
| 5 `enlighten` | `enlighten` | `skillId:int`（必填） | `{skillId:number, level:number, lingyun:number}` | `INVALID_PARAM`、`SKILL_NOT_FOUND`、`NOT_LEARNED`、`MAX_LEVEL_REACHED`、`LINGYUN_NOT_ENOUGH` | `skill.action.ts:55-62`；`skill.service.ts:292-341` |
| 6 `lingyunGrant`（dev） | `lingyunGrant` | `amount:int`（必填） | `{lingyun:number}` | `INVALID_PARAM`(需 1~1000000)、`FORBIDDEN`、`RATE_LIMITED` | `skill.action.ts:64-71`；`skill.service.ts:344-361` |
| 7 `jadeGrant`（dev） | `jadeGrant` | `count:int`（必填） | `{jadeSlips:number}` | `INVALID_PARAM`(需 1~100)、`FORBIDDEN`、`RATE_LIMITED` | `skill.action.ts:73-80`；`skill.service.ts:364-381` |

> panelUpdate 上限：`PANEL_LIMITS = {aux:3, shufa:5}`（`skill.types.ts:39`）；神识预算 `spiritBudget=100`（`config/app.config.json`）。
> 数组元素必须为非空 string，`[]` 视为空面板（`skill.service.ts:225-238`）。

### 2.6 economy 段（cmd 70）

| subCmd | 方法 | 请求 data | 成功 data | 失败码 | 出处 |
|---|---|---|---|---|---|
| 1 `currencies` | `currencies` | 忽略 | `{currencies: CurrencyView[]}`（§5.5） | — | `economy.action.ts:23-28`；`currency.service.ts:44-70` |
| 2 `currencyGrant`（dev） | `currencyGrant` | `code:string`（必填非空）；`count:int`（必填） | `{code:string, amount:number}`（amount=注入后总额） | `INVALID_PARAM`(code 缺失 / count 非 1~9999)、`FORBIDDEN`、`RATE_LIMITED`、`CURRENCY_NOT_FOUND` | `economy.action.ts:30-39`；`currency.service.ts:73-109` |
| 3 `craft` | `craft` | `itemId:int`（必填）；`op:string`（必填，∈ CRAFT_OPS）；`essenceCode?:string` **或** `targetCode?:string`（二者取先非空者作为 `extraCode`） | 成功：`{item: ItemView, outcome?:string, baseStats?:Record<string,number>, baseAffix?:string, essence?:string, guaranteedFamily?:string, mirroredCopyId?:number}`；瓦尔摧毁：`{destroyed:true, itemId:number}` | `INVALID_PARAM`、`INVALID_OP`、`ITEM_NOT_FOUND`、`ITEM_NOT_OWNED`、`ITEM_NOT_IN_BAG`、`LEGENDARY_IMMUTABLE`、`VAALED_IMMUTABLE`、`RARITY_MISMATCH`、`MAX_AFFIXES`、`NO_AFFIX_TO_REMOVE`、`AFFIX_LIMIT`、`MIRROR_IMMUTABLE`、`FRACTURE_REQUIREMENT`、`AFFIX_NOT_FOUND`、`ESSENCE_NOT_FOUND`、`NOT_AVAILABLE`、`NOT_ENOUGH_ESSENCE`、`NOT_ENOUGH_CURRENCY` | `economy.action.ts:41-56`；`craft.service.ts:71-404`（data:383,399-403） |
| 4 `essences` | `essences` | 忽略 | `{essences: EssenceView[]}`（§5.5） | — | `economy.action.ts:58-63`；`currency.service.ts:113-140` |
| 5 `essenceGrant`（dev） | `essenceGrant` | `code:string`（必填非空）；`count:int`（必填） | `{code:string, count:number}`（count=注入后存量） | `INVALID_PARAM`(count 非 1~99)、`FORBIDDEN`、`RATE_LIMITED`、`ESSENCE_NOT_FOUND` | `economy.action.ts:65-74`；`currency.service.ts:142-175` |

> `CRAFT_OPS`（14 个）：`transmute, alchemy, chaos, exalt, annul, scour, divine, blessed, mirror, vaal, fracture, ember, wisp, essence`（`currency.types.ts:19-22`）。

### 2.7 realm 段（cmd 80）

| subCmd | 方法 | 请求 data | 成功 data | 失败码 | 出处 |
|---|---|---|---|---|---|
| 1 `breakthroughInfo` | `breakthroughInfo` | 忽略 | `{realm:number, realmName:string, lingyun:number, nextCost:number\|null, isMax:boolean}` | — | `realm.action.ts:20-25`；`realm.service.ts:35-50` |
| 2 `breakthrough` | `breakthrough` | 忽略 | `{realm:number, realmName:string, lingyun:number}` | `MAX_REALM_REACHED`、`REALM_CHANGED`、`LINGYUN_NOT_ENOUGH` | `realm.action.ts:27-32`；`realm.service.ts:52-78` |

> `REALMS` 14 境、`MAX_REALM=14`（`common/kernel/realm.ts:8-16`）；突破消耗表 15 项（`config/app.config.json`）。

### 2.8 combat 段（cmd 90）

| subCmd | 方法 | 请求 data | 成功 data | 失败码 | 出处 |
|---|---|---|---|---|---|
| 1 `units` | `units` | `realm?:int`（1~14）；`camp?:string`（∈ hostile/neutral/friendly） | `{total:number, units: UnitCatalogView[]}`（§5.8） | `INVALID_PARAM` | `combat.action.ts:23-37`；`unit.service.ts:269-318` |
| 2 `dropTables` | `dropTables` | 忽略 | `{total:number, tables: DropTableView[]}`（§5.8） | — | `combat.action.ts:39-44`；`unit.service.ts:320-352` |
| 3 `spawn`（dev） | `spawn` | `code:string`（必填非空）；`hiddenCount?:int`（0~6） | `{unit: UnitInstanceView}`（§5.8） | `INVALID_PARAM`、`FORBIDDEN`、`RATE_LIMITED`、`UNIT_NOT_FOUND` | `combat.action.ts:46-55`；`unit.service.ts:356-375` |
| 4 `kill`（dev） | `kill` | `code:string`（必填非空）；`count?:int`=1（1~`maxKillsPerRequest`=50） | `SettlementData`（§5.8） | `INVALID_PARAM`、`FORBIDDEN`、`RATE_LIMITED`、`UNIT_NOT_FOUND`、`NOT_KILLABLE` | `combat.action.ts:57-66`；`unit.service.ts:566-585`；`settleKills:437-563` |

### 2.9 zone 段（cmd 100）

| subCmd | 方法 | 请求 data | 成功 data | 失败码 | 出处 |
|---|---|---|---|---|---|
| 1 `zones` | `zones` | 忽略 | `{total:number, playerPower:number, currentZone:string\|null, zones: ZoneView[]}`（§5.8） | — | `zone.action.ts:22-27`；`zone.service.ts:187-227` |
| 2 `progress` | `progress` | 忽略 | `{currentZone:{code,name,chapter}, floor, bestFloor, cleared, unlocked, playerPower, floorRequirement, canChallenge, isBossFloor, encounterUnit, lingyunBonus, dropTierOffset, extraDropDraws}`（§5.8） | `ZONE_NOT_FOUND` | `zone.action.ts:29-34`；`zone.service.ts:229-262` |
| 3 `enter` | `enter` | `zoneCode:string`（必填非空） | `{currentZone:{code,name,chapter}, floor:number, bestFloor:number}` | `INVALID_PARAM`、`ZONE_NOT_FOUND`、`REALM_TOO_LOW`(带额外字段)、`ZONE_LOCKED`(带额外字段) | `zone.action.ts:36-43`；`zone.service.ts:264-288` |
| 4 `challenge` | `challenge` | `zoneCode?:string`（缺省→当前秘境） | `{zone:{code,name}, floor, nextFloor, bestFloor, cleared, playerPower, floorRequirement, isBossFloor, dropTierOffset, extraDropDraws, rewards:{lingyunGained, lingyunBonus, lingyunTotal, items:ItemView[], kept, salvaged:{count,lingyun}, sold:{count,spiritStones}, blockedByTier, currencies:Record<string,number>, essences:Record<string,number>}}` | `INVALID_PARAM`、`ZONE_NOT_FOUND`、`REALM_TOO_LOW`、`ZONE_LOCKED`、`ALREADY_CLEARED`、`CHALLENGE_FAILED`、`UNIT_NOT_FOUND`、`NOT_KILLABLE` | `zone.action.ts:45-56`；`zone.service.ts:290-383` |

> `REALM_TOO_LOW` 的 data 额外含 `{required:number, current:number}`（`zone.service.ts:131-137`）；
> `ZONE_LOCKED` 额外含 `{reason:'prev', prevZone:string|null, requiredPrevBestFloor:number, prevBestFloor:number}`（`zone.service.ts:139-151`）；
> `ALREADY_CLEARED` 额外含 `{zone:{code,name}}`（行 314-318）；`CHALLENGE_FAILED` 额外含 `{zone, floor, playerPower, floorRequirement}`（行 324-334）。
> **这四个码是唯一不使用 `fail()` 而内联构造的失败**，其 `data` 不是 `{code}` 单键。

### 2.10 quest 段（cmd 110）

| subCmd | 方法 | 请求 data | 成功 data | 失败码 | 出处 |
|---|---|---|---|---|---|
| 1 `list` | `list` | 忽略 | `{total:number, completed:number, quests: QuestView[]}`（§5.10） | — | `quest.action.ts:24-29`；`quest.service.ts:154-182` |
| 2 `detail` | `detail` | `code:string`（必填非空） | `{quest: QuestDetail}`（§5.10，含 `trigger/rewards/dialogues/nextQuest/completedAt`） | `INVALID_PARAM`、`QUEST_NOT_FOUND` | `quest.action.ts:31-38`；`quest.service.ts:184-218` |
| 3 `sync` | `sync` | 忽略 | `{completedCount:number, completed:{code,name,rewards:QuestRewards}[], granted:{...}[], totals:{lingyun,spiritStones,jadeSlips,currencies:Record<string,number>,essences:Record<string,number>}}` | — | `quest.action.ts:40-45`；`quest.service.ts:249-331`（data:324-329） |
| 4 `chapterList` | `chapterList` | 忽略 | `{total:number, currentChapter:number\|null, chapters: ChapterView[]}`（§5.10） | — | `quest.action.ts:47-52`；`chapter.service.ts:78-126` |
| 5 `chapterDetail` | `chapterDetail` | `chapter:string`（必填非空；支持序号字符串或 code） | `{chapter: ChapterDetail}`（§5.10） | `INVALID_PARAM`、`CHAPTER_NOT_FOUND` | `quest.action.ts:54-61`；`chapter.service.ts:128-183` |
| 6 `chapterSync` | `chapterSync` | 忽略 | `{completedCount:number, completed:{code,name,rewards}[], granted:{...}[], totals:{lingyun,spiritStones,jadeSlips,currencies,essences}}` | — | `quest.action.ts:63-68`；`chapter.service.ts:185-257`（data:250-255） |

### 2.11 story 段（cmd 120）

| subCmd | 方法 | 请求 data | 成功 data | 失败码 | 出处 |
|---|---|---|---|---|---|
| 1 `chapter` | `chapter` | `chapter:string`（必填非空；支持序号或 code） | `{chapter:{code,name,chapter}, nodes: StoryNode[]}`（§5.11） | `INVALID_PARAM`、`CHAPTER_NOT_FOUND` | `story.action.ts:21-28`；`story.service.ts:84-112` |
| 2 `quest` | `quest` | `code:string`（必填非空） | `{quest:{code,name,status}, nodes: StoryNode[]}` | `INVALID_PARAM`、`QUEST_NOT_FOUND` | `story.action.ts:30-37`；`story.service.ts:114-128` |
| 3 `seen` | `seen` | `nodeKey:string`（必填，1~120 字符） | `{nodeKey:string, seen:true}` | `INVALID_PARAM` | `story.action.ts:39-46`；`story.service.ts:130-140` |

> 节点键约定：`chapter:<code>:intro|outro`、`quest:<code>:start|done`（`story.service.ts:4-5,75-80,99-105`）。

### 2.12 idle 段（cmd 130）

| subCmd | 方法 | 请求 data | 成功 data | 失败码 | 出处 |
|---|---|---|---|---|---|
| 1 `status` | `status` | 忽略 | `{realm, lastSettleAt:string(ISO), pendingHours, effectiveHours, estimatedKills, estimatedLingyun, dailyItemsProduced, dailyItemCap, config:{roundsPerHour,efficiencyPct,maxOfflineHours}}`（§5.12） | — | `idle.action.ts:29-34`；`idle.service.ts:85-107` |
| 2 `settle` | `settle` | `unitCode?:string`（非空才生效）；`hours?:number`（0~10000，仅非生产） | 正常：`SettlementData & {zone:{code,name,floor,isBoss}\|null, offlineHours, effectiveHours, dailyItemsProduced, dailyItemCap}`；无可结算（kills≤0 且未覆盖 hours）：`{unit:null, offlineHours, effectiveHours, kills:0, lingyunGained:0, lingyunTotal, items:[], kept:0, salvaged:{count:0,lingyun:0}, sold:{count:0,spiritStones:0}, discarded:0, blockedByTier:0, currencies:{}, essences:{}, itemsProduced:0, dailyItemsProduced, dailyItemCap}` | `INVALID_PARAM`、`FORBIDDEN`、`ZONE_NOT_FOUND`、`UNIT_NOT_FOUND`、`NOT_KILLABLE` | `idle.action.ts:36-58`；`idle.service.ts:109-201`（空结算:132-155；正常:189-200） |

---

## §3 业务错误码总表（去重 51 个）

> 提取方式：`grep -rno "fail('[A-Z_0-9]*'" src/` + 人工核对两处跨行 `fail(`（`item.service.ts:105` RATE_LIMITED、`skill.service.ts:275` SPIRIT_BUDGET_EXCEEDED）+ 4 处内联 `code: '...'`。
> 「默认文案」列取该码在源码中的**代表文案**；带 `{}` 的是模板串，实际值随上下文。

| # | 错误码 | 默认/代表文案 | 出处（文件:行） |
|---|---|---|---|
| 1 | `UNAUTHORIZED` | 登录状态无效，请重新登录 | `action-support.ts:21`（调用点：所有 `requireUserId`） |
| 2 | `INVALID_PARAM` | 参数不合法（默认）；实际多为自定义文案 | `action-support.ts:23`；Action 层 20+ 处；`item.affix.service.ts:149`；`skill.service.ts:353,373`；`currency.service.ts:84,153`；`unit.service.ts:362,573`；`craft.service.ts:257,269,310`；`idle.service.ts:119`；`story.service.ts:134` |
| 3 | `CHARACTER_NOT_FOUND` | 尚未创建角色 | `action-support.ts:25`；`item.service.ts:72`；`skill.service.ts:46`；`currency.service.ts:40`；`realm.service.ts:26`；`unit.service.ts:101`；`zone.service.ts:56`；`quest.service.ts:42`；`chapter.service.ts:37`；`story.service.ts:32`；`craft.service.ts:81`；`idle.service.ts:40` |
| 4 | `FORBIDDEN` | 开发接口在生产环境不可用（默认）；或「只能为本人角色生成物品」/「生产环境不支持离线时长覆盖」 | `action-support.ts:27`；`item.service.ts:92,100`；`skill.service.ts:38`；`currency.service.ts:79,148`；`unit.service.ts:94`；`idle.service.ts:122` |
| 5 | `RATE_LIMITED` | `生成接口每分钟最多调用 {N} 次` / `开发注入接口…` / `开发发放接口…` / `开发接口…` | `item.service.ts:105`；`skill.service.ts:350,370`；`currency.service.ts:87,156`；`unit.service.ts:365,576` |
| 6 | `BASE_NOT_FOUND` | 物品基底不存在 | `item.affix.service.ts:146` |
| 7 | `RARITY_EXCEEDS_LIMIT` | `超出基底稀有度上限（最高{名}）` | `item.affix.service.ts:152` |
| 8 | `ITEM_NOT_FOUND` | 物品不存在 | `item.service.ts:175,200,285,333`；`craft.service.ts:94` |
| 9 | `ITEM_NOT_OWNED` | 物品不属于当前角色 | `item.service.ts:176,201,286,334`；`craft.service.ts:95` |
| 10 | `ITEM_NOT_IN_BAG` | 物品状态不可装备 / 装备栏初始化失败 / 物品无合法装备槽位 / 已装备的物品无法丢弃，请先卸下 / 仅背包中的物品可炼器 | `item.service.ts:202,221,239,335`；`craft.service.ts:96` |
| 11 | `TIER_TOO_HIGH` | `当前境界 {realm}，无法装备 T{tier} 物品` | `item.service.ts:206` |
| 12 | `SLOT_OCCUPIED` | 两枚戒指槽位均已占用 / 槽位已占用 | `item.service.ts:235,241` |
| 13 | `ITEM_NOT_EQUIPPED` | 角色未拥有装备栏记录 / 物品未被装备 | `item.service.ts:292,301` |
| 14 | `INVALID_RULE` | 规则名称不能为空 | `item.service.ts:468` |
| 15 | `PICKUP_RULE_NOT_FOUND` | 规则不存在 | `item.service.ts:492,493,524` |
| 16 | `SKILL_NOT_FOUND` | 功法不存在 / `功法不存在：{code}` | `skill.service.ts:118,247,299` |
| 17 | `ALREADY_LEARNED` | 该功法已修习，无需重复 / 该功法已修习（并发） | `skill.service.ts:124,155` |
| 18 | `JADE_NOT_ENOUGH` | 未开光玉简不足（需要 1 枚） | `skill.service.ts:132` |
| 19 | `SLOTS_INVALID` | 面板结构非法 / 主心法槽位只能用心法 / `辅心法槽位只能用心法：{code}` / `术法槽位只能用术法：{code}` | `skill.service.ts:225,226,249,251,254` |
| 20 | `DUPLICATE_SLOT` | 辅心法槽位 code 重复 / 术法槽位 code 重复 / 主心法与辅心法槽位重复 | `skill.service.ts:235,236,242` |
| 21 | `SLOT_COUNT_EXCEEDED` | `辅心法最多 {aux} 个` / `术法最多 {shufa} 个`（3 / 5） | `skill.service.ts:240,241` |
| 22 | `NOT_LEARNED` | 尚未修习该功法 / `未修习功法：{code}` | `skill.service.ts:266,306` |
| 23 | `MAX_LEVEL_REACHED` | `已达参悟上限 {N} 级`（20） | `skill.service.ts:308` |
| 24 | `LINGYUN_NOT_ENOUGH` | `灵韵不足：需要 {cost}，当前 {cur}` / `灵韵不足：突破需 {cost}，当前 {cur}` | `skill.service.ts:319`；`realm.service.ts:69` |
| 25 | `SPIRIT_BUDGET_EXCEEDED` | `辅心法神识占用 {used} 超出预算 {budget}` | `skill.service.ts:275-278` |
| 26 | `INVALID_OP` | `未知炼器操作：{op}` | `craft.service.ts:78` |
| 27 | `RARITY_MISMATCH` | 蜕变石仅限凡品 / 点金石仅限凡品 / 混沌石仅限灵品/宝品 / 崇高石需灵品及以上 / 重铸石仅限灵品/宝品 / 神圣石仅限灵品/宝品 / 祝福石不可用于传奇 / 古灵余烬不可用于传奇 / 精华仅限灵品/宝品 | `craft.service.ts:135,143,151,158,183,189,195,244,268` |
| 28 | `MAX_AFFIXES` | 宝品词缀已达 6 条上限 | `craft.service.ts:169` |
| 29 | `NO_AFFIX_TO_REMOVE` | 没有可剥离的词缀 | `craft.service.ts:177` |
| 30 | `AFFIX_LIMIT` | 没有可重roll数值的词缀 / 无新的基底词缀可选 | `craft.service.ts:190,251` |
| 31 | `MIRROR_IMMUTABLE` | 镜像不可再复制 | `craft.service.ts:206` |
| 32 | `FRACTURE_REQUIREMENT` | 破溃宝珠仅限宝品 / 宝品至少 4 条词缀方可锁定天定铭文 | `craft.service.ts:236,237` |
| 33 | `AFFIX_NOT_FOUND` | `基底词缀不存在：{code}` | `craft.service.ts:262` |
| 34 | `ESSENCE_NOT_FOUND` | `精华不存在：{code}` | `craft.service.ts:275`；`currency.service.ts:160` |
| 35 | `NOT_AVAILABLE` | `该底材无「{name}」可定向的词缀` | `craft.service.ts:280` |
| 36 | `NOT_ENOUGH_ESSENCE` | 精华不足：需要 1 枚对应精华 | `craft.service.ts:318` |
| 37 | `NOT_ENOUGH_CURRENCY` | 通货不足：需要 1 枚对应工艺通货 | `craft.service.ts:327` |
| 38 | `LEGENDARY_IMMUTABLE` | 传奇物品词缀固定，不可洗炼 | `craft.service.ts:97` |
| 39 | `VAALED_IMMUTABLE` | 瓦尔变异不可逆，此后不可再洗炼 | `craft.service.ts:98` |
| 40 | `CURRENCY_NOT_FOUND` | `通货不存在：{code}` | `currency.service.ts:94` |
| 41 | `MAX_REALM_REACHED` | `已达封顶境界（{名}）` | `realm.service.ts:56` |
| 42 | `REALM_CHANGED` | 境界已变化，请重试 | `realm.service.ts:67` |
| 43 | `UNIT_NOT_FOUND` | `单位不存在：{code}` | `unit.service.ts:368,444` |
| 44 | `NOT_KILLABLE` | `{name} 非敌对单位，无法击杀` | `unit.service.ts:446` |
| 45 | `ZONE_NOT_FOUND` | 暂无可用秘境 / `秘境不存在：{code}` / 秘境不存在 | `zone.service.ts:235,237,268,300,303,306`（`fail` 版）；`idle.service.ts:162` |
| 46 | `REALM_TOO_LOW` | `境界不足：{name}需要 {min} 境` | `zone.service.ts:131-137`（**内联构造**，data 额外含 required/current） |
| 47 | `ZONE_LOCKED` | `尚未解锁：{name}` | `zone.service.ts:139-151`（**内联构造**，data 额外含 reason/prevZone/requiredPrevBestFloor/prevBestFloor） |
| 48 | `ALREADY_CLEARED` | `该秘境已通关：{name}` | `zone.service.ts:314-318`（**内联构造**，data 额外含 zone） |
| 49 | `CHALLENGE_FAILED` | `挑战失败：战力不足（{power} < {req}）` | `zone.service.ts:324-334`（**内联构造**，data 额外含 zone/floor/playerPower/floorRequirement） |
| 50 | `QUEST_NOT_FOUND` | `任务不存在：{code}` | `quest.service.ts:189`；`story.service.ts:119` |
| 51 | `CHAPTER_NOT_FOUND` | `章节不存在：{key}` | `chapter.service.ts:134`；`story.service.ts:90` |

> **前端注意**：46–49 四码的 `data` 不是 `{code:string}`，需按各自结构解析（TS 建议联合类型，见 §5.9）。

---

## §4 cmd 段 / subCmd 常量表（镜像 `src/ionet/cmd.ts`）

> 来源：`src/ionet/cmd.ts:22-170`。段值 10 间隔；`auth=10` / `character=20` 仅占位，**当前不注册任何 Action**（`cmd.ts:7-8`）。
> `cmdMerge(cmd, subCmd) = (cmd << 16) | subCmd`（`cmd.ts:164-166`）。

```ts
export const CMD_SEGMENTS = {
  system: 1,
  auth: 10,        // 占位（HTTP auth 未迁入）
  character: 20,   // 占位（HTTP character 未迁入）
  item: 30,
  prop: 40,
  equip: 50,
  skill: 60,
  economy: 70,
  realm: 80,
  combat: 90,
  zone: 100,
  quest: 110,
  story: 120,
  idle: 130,
} as const;

export const SYSTEM_CMD  = { cmd: 1,   ping: 1 } as const;
export const ITEM_CMD    = { cmd: 30,  inventory: 1, inventoryDetail: 2, bases: 3,
                             pickupRuleList: 4, pickupRuleCreate: 5,
                             pickupRuleUpdate: 6, pickupRuleDelete: 7 } as const;
export const PROP_CMD    = { cmd: 40,  discard: 1, generate: 2 } as const;
export const EQUIP_CMD   = { cmd: 50,  equip: 1, unequip: 2, equipment: 3 } as const;
export const SKILL_CMD   = { cmd: 60,  list: 1, learn: 2, panel: 3, panelUpdate: 4,
                             enlighten: 5, lingyunGrant: 6, jadeGrant: 7 } as const;
export const ECONOMY_CMD = { cmd: 70,  currencies: 1, currencyGrant: 2, craft: 3,
                             essences: 4, essenceGrant: 5 } as const;
export const REALM_CMD   = { cmd: 80,  breakthroughInfo: 1, breakthrough: 2 } as const;
export const COMBAT_CMD  = { cmd: 90,  units: 1, dropTables: 2, spawn: 3, kill: 4 } as const;
export const ZONE_CMD    = { cmd: 100, zones: 1, progress: 2, enter: 3, challenge: 4 } as const;
export const QUEST_CMD   = { cmd: 110, list: 1, detail: 2, sync: 3,
                             chapterList: 4, chapterDetail: 5, chapterSync: 6 } as const;
export const STORY_CMD   = { cmd: 120, chapter: 1, quest: 2, seen: 3 } as const;
export const IDLE_CMD    = { cmd: 130, status: 1, settle: 2 } as const;

/** 免鉴权白名单（cmdMerge 键）：当前仅 system.ping = (1<<16)|1 = 65537 */
export const PUBLIC_ACTION_KEYS: ReadonlySet<number> = new Set([65537]);
```

> 其它常量（枚举值直接给前端用）：
> - `UNIT_CAMPS = ['hostile','neutral','friendly']`（`unit.types.ts:8`）
> - `DROP_KINDS = ['base','currency','essence']`（`unit.types.ts:12`）
> - `LOOT_ACTIONS = ['keep','salvage','sell','discard']`（`unit.types.ts:16`）
> - `CRAFT_OPS`（14 项，`currency.types.ts:19-22`）
> - `EQUIP_SLOT_KEYS`（10 项，`item.types.ts:9-20`）
> - `RARITY_NAMES = ['凡品','灵品','宝品','传奇']`（`item.types.ts:6`）
> - `REALMS`（14 境，`common/kernel/realm.ts:8-11`）、`MAX_REALM=14`
> - `QUEST_STATUSES = ['locked','active','completed']`（`quest.types.ts:75`）
> - `DAOJI_SET = ['剑','雷','火','冰','体','阵','丹','符']`（`skill.types.ts:8`）
> - `SKILL_TYPE = 'xinfa' | 'shufa'`（`skill.types.ts:5`）
> - `PANEL_LIMITS = { aux: 3, shufa: 5 }`（`skill.types.ts:39`）

---

## §5 TypeScript interface 草案（与源码逐字段一致）

> BIGINT 列已由服务端经 `bigintToSafeNumber` 转为 **number**（超 ±(2^53−1) 抛 RangeError，`common/utils/safe-bigint.ts:1-16`）。
> 日期字段：inventory/detail 的 `createdAt` 来自 pg，可能为 `string | Date`（JSON 序列化后为 ISO string）。

### 5.1 item.inventory

```ts
// 出处：item.service.ts:114-163（data:162）、item.types.ts:44-53,101-123、item.affix.service.ts:409-433
export interface ItemAffixView {
  affixId: number;
  value: number | null;                       // 基底/固定词缀为 null
  polarity: 'prefix' | 'suffix' | 'base';
  key: string | null;                         // roll 来源效果键
  fractured?: boolean;                        // 天定铭文
  // 定义侧冗余（AffixView = AffixEntry & 以下三项）
  code: string;
  name: string;
  tier: number;
}

export interface ItemView {
  id: number;
  baseId: number;
  baseCode: string;
  name: string;
  category: string;
  slot: string | null;
  rarity: number;                             // 0凡 1灵 2宝 3传奇
  rarityName: string;                         // RARITY_NAMES[rarity]，越界为 '未知'
  tier: number;
  quality: number;
  status: string;                             // 'bag' | 'equipped' | ...
  affixTexts: string[];                       // 已渲染中文词条
  affixes: ItemAffixView[];
  createdAt?: string | Date;                  // inventory/detail 恒有；generate/craft 单件渲染时不带
}

export interface InventoryData {
  total: number;
  page: number;                               // 服务端已 clamp 到 [1, MAX_PAGE]
  pageSize: number;                           // 服务端已 clamp 到 [1,100]
  items: ItemView[];
}
```

### 5.2 item.bases

```ts
// 出处：item.service.ts:379-429（view 411-422，pool 432-447）
export interface BaseView {
  id: number;
  code: string;
  name: string;
  category: string;
  slot: string | null;
  subType: string | null;
  tier: number;
  baseStats: unknown;                         // ⚠️ 见 §6-1：JSON.parse(base_stats)，形状未定
  rarityLimit: number;
  dropWeight: number;
  affixPoolSummary?: { prefix: string[]; suffix: string[] };  // 仅 withPool=1 时出现
}

export interface BasesData {
  total: number;
  page: number;
  pageSize: number;
  bases: BaseView[];
}
```

### 5.3 equip.equipment / equip / unequip

```ts
// 出处：item.service.ts:343-376（equipment）、183-267（equip）、270-314（unequip）
export type EquipSlotKey =
  | 'weapon' | 'body' | 'helmet' | 'gloves' | 'boots'
  | 'shield' | 'ring1' | 'ring2' | 'amulet' | 'belt';

export interface EquipmentSlotItem { id: number; name: string; rarity: number; tier: number }

export interface EquipmentData {
  slots: Record<EquipSlotKey, EquipmentSlotItem | null>;   // 缺记录时全 null
  equippedCount: number;
}

/** equip / unequip 共用 */
export interface EquipMutationData {
  slot: string;                                            // 实际落位/卸下的槽位键
  slots: Record<EquipSlotKey, number | null>;              // 物品 id 或 null
}
```

### 5.4 skill.panel / skill.list

```ts
// 出处：skill.service.ts:177-212（panelView）、79-108（catalog）、skill.types.ts:34-43
export interface SkillInfo { code: string; name: string; daoji: string; spiritCost: number }

export interface PanelView {
  xinfa: {
    main: string | null;                                    // 技能 code
    mainInfo: SkillInfo | null;
    aux: { code: string; info: SkillInfo | null }[];
  };
  shufa: {
    code: string;
    info: SkillInfo | null;
    synergy: { code: string; matched: boolean; text: string } | null;
  }[];
  spiritUsed: number;                                       // 仅统计 aux
  spiritBudget: number;                                     // APP_CONFIG.spiritBudget = 100
  mainDaoji: string | null;
}

export interface PanelData { panel: PanelView }

/** skill.list 图鉴项 */
export interface SkillCatalogView {
  id: number;
  code: string;
  name: string;
  skillType: string;                                        // 'xinfa' | 'shufa'
  daoji: string;
  school: string;
  spiritCost: number;
  description: string;                                      // null → ''
  learned: boolean;
  level: number | null;                                     // 未修习为 null
  effectsTexts: string[];                                   // 已渲染「{名} {值}（{L}级 效果）」
}
export interface SkillCatalogData { skills: SkillCatalogView[] }
```

### 5.5 economy.currencies / essences

```ts
// 出处：currency.service.ts:44-70、113-140
export interface CurrencyView {
  id: number;
  code: string;
  name: string;
  description: string;                                      // null → ''
  implemented: boolean;
  owned: number;                                            // 未持有为 0（BIGINT 已转 number）
}
export interface CurrenciesData { currencies: CurrencyView[] }

export interface EssenceView {
  id: number;
  code: string;
  name: string;
  polarity: string;
  targetFamily: string;
  description: string;                                      // null → ''
  owned: number;
}
export interface EssencesData { essences: EssenceView[] }
```

### 5.6 realm.breakthroughInfo / breakthrough

```ts
// 出处：realm.service.ts:35-50、52-78
export interface BreakthroughInfoData {
  realm: number;                                            // 1~14
  realmName: string;                                        // REALMS[realm-1]，越界 '未知'
  lingyun: number;
  nextCost: number | null;                                  // 封顶为 null
  isMax: boolean;                                           // realm >= 14
}
export interface BreakthroughData {
  realm: number;                                            // 突破后
  realmName: string;
  lingyun: number;                                          // 扣费后余额
}
```

### 5.7 character.info（REST `/api/character/info|check|create`）

```ts
// 出处：character.service.ts:20-45,146-160；auth.service.ts:21-24
export interface Character {
  id: number;
  userId: number;
  nickname: string;
  gender: string;                                           // 'male' | 'female'
  title: string | null;                                     // 创建时为 '散修'
  spiritStones: number;                                     // BIGINT → number
  silver: number;                                           // （弃用）BIGINT → number
  realm: number;
  lingyun: number;
  jadeSlips: number;
}

export interface CharacterResultData {
  character: Character | null;
  hasCharacter: boolean;
}

export interface AuthUser { id: number; username: string }
export interface AuthResultData { token: string; user: AuthUser }
```

### 5.8 zone.zones / zone.progress / combat 系列

```ts
// 出处：zone.service.ts:187-227（zones view 199-219）、229-262（progress）、zone.types.ts:40-49
export interface ZoneProgressView { floor: number; bestFloor: number; cleared: boolean }

export interface ZoneView {
  id: number;
  code: string;
  name: string;
  chapter: number;
  orderIndex: number;
  minRealm: number;
  requirePrevBestFloor: number;
  unlocked: boolean;
  unlockedReason: 'ok' | 'realm' | 'prev';
  prevZone: string | null;
  prevBestFloor: number;
  current: boolean;
  unitCode: string;
  bossCode: string | null;
  basePower: number;
  powerStep: number;
  maxFloor: number;
  lingyunBonusPerFloor: number;
  progress: ZoneProgressView;
}

export interface ZonesData {
  total: number;
  playerPower: number;
  currentZone: string | null;
  zones: ZoneView[];
}

export interface ZoneProgressData {
  currentZone: { code: string; name: string; chapter: number };
  floor: number;
  bestFloor: number;
  cleared: boolean;
  unlocked: boolean;
  playerPower: number;
  floorRequirement: number;
  canChallenge: boolean;
  isBossFloor: boolean;
  encounterUnit: string;
  lingyunBonus: number;
  dropTierOffset: number;
  extraDropDraws: number;
}

export interface ZoneEnterData {
  currentZone: { code: string; name: string; chapter: number };
  floor: number;
  bestFloor: number;
}

export interface ZoneChallengeRewards {
  lingyunGained: number;
  lingyunBonus: number;
  lingyunTotal: number;
  items: ItemView[];                                        // 上限 50 件
  kept: number;
  salvaged: { count: number; lingyun: number };
  sold: { count: number; spiritStones: number };
  blockedByTier: number;
  currencies: Record<string, number>;
  essences: Record<string, number>;
}
export interface ZoneChallengeData {
  zone: { code: string; name: string };
  floor: number;
  nextFloor: number;
  bestFloor: number;
  cleared: boolean;
  playerPower: number;
  floorRequirement: number;
  isBossFloor: boolean;
  dropTierOffset: number;
  extraDropDraws: number;
  rewards: ZoneChallengeRewards;
}

// ===== combat ===== 出处：unit.service.ts:269-318,320-352,356-375、unit.types.ts:76-94
export interface UnitCatalogView {
  id: number;
  code: string;
  name: string;
  realm: number;
  realmName: string;
  camp: string;
  givesLingyun: boolean;
  dropTable: string | null;
  baseStats: Record<string, number>;                        // hp/atk/def/spiritPower + 覆盖键
  hiddenPool: string[];                                     // 隐藏词条 code 列表
  lingyunReward: number;
}
export interface UnitsData { total: number; units: UnitCatalogView[] }

export interface DropEntryView {
  kind: string;                                             // 'base' | 'currency' | 'essence'
  baseId: number | null;
  baseTier: number | null;
  rarity: number | null;
  currencyCode: string | null;
  essenceCode: string | null;
  minCount: number;
  maxCount: number;
  weight: number;
}
export interface DropTableView {
  id: number; code: string; name: string;
  dropsPerKill: number; tierOffset: number;
  entries: DropEntryView[];
}
export interface DropTablesData { total: number; tables: DropTableView[] }

export interface UnitInstanceView {
  code: string;
  name: string;
  realm: number;
  realmName: string;
  camp: string;
  givesLingyun: boolean;
  dropTable: string | null;
  baseStats: Record<string, number>;
  hiddenAffixes: { code: string; name: string; effects: Record<string, number> }[];
  finalStats: Record<string, number>;                       // 含 lingyunGain 等扁平派生键
  lingyunReward: number;
}
export interface UnitSpawnData { unit: UnitInstanceView }

/** combat.kill / zone.challenge.rewards / idle.settle 的公共结算体 */
export interface SettlementData {
  unit: { code: string; name: string; realm: number };
  kills: number;
  lingyunGained: number;
  lingyunTotal: number;
  items: ItemView[];
  kept: number;
  salvaged: { count: number; lingyun: number };
  sold: { count: number; spiritStones: number };
  discarded: number;
  blockedByTier: number;
  currencies: Record<string, number>;
  essences: Record<string, number>;
  itemsProduced: number;
}
```

### 5.9 zone 失败码的联合类型（data 不是单键 `{code}`）

```ts
// 出处：zone.service.ts:131-137,139-151,314-318,324-334
export type ZoneFailData =
  | { code: 'REALM_TOO_LOW'; required: number; current: number }
  | { code: 'ZONE_LOCKED'; reason: 'prev'; prevZone: string | null;
      requiredPrevBestFloor: number; prevBestFloor: number }
  | { code: 'ALREADY_CLEARED'; zone: { code: string; name: string } }
  | { code: 'CHALLENGE_FAILED'; zone: { code: string; name: string };
      floor: number; playerPower: number; floorRequirement: number }
  | { code: string };   // 其余全部失败码（含 ZONE_NOT_FOUND / INVALID_PARAM）
```

### 5.10 quest.list / detail / chapter

```ts
// 出处：quest.service.ts:132-182,184-218、quest.types.ts:30-57、chapter.service.ts:78-183
export interface QuestTrigger { realm?: number; requires?: string[] }

export interface QuestRewards {
  lingyun?: number;
  spiritStones?: number;
  jadeSlips?: number;
  currencies?: Record<string, number>;
  essences?: Record<string, number>;
}

export interface ObjectiveProgress {
  type: string;                // reach_realm | zone_best_floor | zone_cleared | own_items
                               // | learn_skills | lingyun | kill_total | kill_unit
                               // | breakthrough_total | craft_total | 未知(恒 false)
  key?: string;
  value?: number;
  current: number;
  done: boolean;
  desc: string;                // 缺省 ''
}

export interface QuestView {
  code: string;
  chapter: number;
  name: string;
  orderIndex: number;
  status: 'locked' | 'active' | 'completed';
  claimable: boolean;          // status==='active' && objectives 非空 && 全 done
  objectives: ObjectiveProgress[];
}
export interface QuestListData { total: number; completed: number; quests: QuestView[] }

export interface QuestDetail extends QuestView {
  trigger: QuestTrigger;                             // DB JSON，形状见 §6-4
  rewards: QuestRewards;                             // DB JSON
  dialogues: Record<string, string> | null;          // DB JSON，键为 'start'/'done'（story.service.ts:72-81）
  nextQuest: string | null;
  completedAt: string | Date | null;
}
export interface QuestDetailData { quest: QuestDetail }

export interface QuestSyncData {
  completedCount: number;
  completed: { code: string; name: string; rewards: QuestRewards }[];
  granted: { code: string; name: string; rewards: QuestRewards }[];
  totals: { lingyun: number; spiritStones: number; jadeSlips: number;
            currencies: Record<string, number>; essences: Record<string, number> };
}

export interface ChapterView {
  code: string;
  chapter: number;
  name: string;
  theme: string | null;
  minRealm: number;
  zoneCode: string;
  requiresChapter: string | null;
  orderIndex: number;
  unlocked: boolean;
  unlockedReason: 'ok' | 'realm' | 'prev';
  completed: boolean;
  quests: { total: number; completed: number };
}
export interface ChapterListData {
  total: number;
  currentChapter: number | null;
  chapters: ChapterView[];
}

export interface ChapterDetail {
  code: string;
  chapter: number;
  name: string;
  theme: string | null;
  minRealm: number;
  zone: { code: string; name: string } | null;
  unlocked: boolean;
  unlockedReason: 'ok' | 'realm' | 'prev';
  completed: boolean;
  requiresChapter: string | null;
  rewards: QuestRewards;                             // DB JSON
  dialogues: Record<string, string> | null;          // DB JSON，键 'intro'/'outro'
  quests: { code: string; name: string; status: string }[];   // status ∈ locked|active|completed
}
export interface ChapterDetailData { chapter: ChapterDetail }

export interface ChapterSyncData {
  completedCount: number;
  completed: { code: string; name: string; rewards: QuestRewards }[];
  granted: { code: string; name: string; rewards: QuestRewards }[];
  totals: { lingyun: number; spiritStones: number; jadeSlips: number;
            currencies: Record<string, number>; essences: Record<string, number> };
}
```

### 5.11 story.chapter / quest / seen

```ts
// 出处：story.service.ts:13-20,84-140
export interface StoryNode {
  nodeKey: string;              // chapter:<code>:intro|outro | quest:<code>:start|done
  type: string;                 // 'chapter_intro' | 'chapter_outro' | 'quest_start' | 'quest_done'
  text: string;                 // 来自 DB dialogues
  seen: boolean;
  questCode?: string;           // 仅 quest_* 节点
  questStatus?: string;         // 仅 quest_* 节点
}
export interface StoryChapterData {
  chapter: { code: string; name: string; chapter: number };
  nodes: StoryNode[];
}
export interface StoryQuestData {
  quest: { code: string; name: string; status: string };
  nodes: StoryNode[];
}
export interface StorySeenData { nodeKey: string; seen: true }
```

### 5.12 idle.status / idle.settle

```ts
// 出处：idle.service.ts:77-107（status）、109-201（settle）
export interface IdleConfigView {
  roundsPerHour: number;        // 60
  efficiencyPct: number;        // 60
  maxOfflineHours: number;      // 12
}
export interface IdleStatusData {
  realm: number;
  lastSettleAt: string;         // ISO（服务端 toISOString）
  pendingHours: number;         // max(0, 真实离线小时)
  effectiveHours: number;       // round(offlineHours × efficiency) / 100
  estimatedKills: number;       // floor(offlineHours × rounds × efficiency / 100)
  estimatedLingyun: number;
  dailyItemsProduced: number;
  dailyItemCap: number;         // 200
  config: IdleConfigView;
}

/** 无可结算分支（kills≤0 且未传 hours） */
export interface IdleSettleEmptyData {
  unit: null;
  offlineHours: number;
  effectiveHours: number;
  kills: 0;
  lingyunGained: 0;
  lingyunTotal: number;
  items: [];
  kept: 0;
  salvaged: { count: 0; lingyun: 0 };
  sold: { count: 0; spiritStones: 0 };
  discarded: 0;
  blockedByTier: 0;
  currencies: Record<string, never>;
  essences: Record<string, never>;
  itemsProduced: 0;
  dailyItemsProduced: number;
  dailyItemCap: number;
}

/** 正常结算分支 */
export type IdleSettleData = SettlementData & {
  zone: { code: string; name: string; floor: number; isBoss: boolean } | null;
  offlineHours: number;
  effectiveHours: number;
  dailyItemsProduced: number;
  dailyItemCap: number;
};
```

### 5.13 item 拾取规则（辨宝法阵）

```ts
// 出处：item.service.ts:610-622（toRuleView）
export interface PickupRuleView {
  id: number;
  characterId: number;
  name: string;
  rarityMin: number;            // 0~3
  tierMin: number;              // 1~14
  affixCodes: string[];         // 最多 50
  action: string;               // 'salvage' | 'sell' | 'discard' | 'keep'
  enabled: boolean;
  priority: number;             // 0~1000
}
export interface PickupRulesData { rules: PickupRuleView[] }
export interface PickupRuleData { rule: PickupRuleView }
export interface PickupRuleDeleteData { ruleId: number }
```

---

## §6 不确定项清单（明确标注「未确定」）

> 说明：Action 层与门面签名普遍写 `Promise<unknown>` / `data?: unknown` / `Record<string, unknown>`，**这是框架的返回值约定包袱，不代表形状未知**——上述 §5 已把绝大多数追到具体字段。
> 以下为**真正追不到字段级形状**的项目，逐条给出追踪到的最深位置。

| # | 项目 | 状态 | 追踪到的最深位置 | 说明 |
|---|---|---|---|---|
| 1 | `item.bases[].baseStats` | **未确定** | `item.service.ts:419` `this.tryParse(row.base_stats, null)`；`item.types.ts:77` `base_stats: string \| null` | DB `game_item_bases.base_stats` 的 JSON 内容无 schema/类型声明。字段级形状（是否 `Record<string, number>`、键名集合）**未确定**；建议前端收 `unknown` 或 `Record<string, number>` 待实测。 |
| 2 | `quest.detail.quest.trigger` | 部分确定 | `quest.service.ts:210` `parseJson<QuestTrigger>(def.trigger_cond, {})`；`quest.types.ts:30-33` | TS 声明为 `{realm?:number; requires?:string[]}`，但值为 DB JSON，**是否含其它键未确定**（`isTriggered` 只读这两个键，`quest.service.ts:147-152`）。 |
| 3 | `quest.detail.quest.rewards` / 各 sync 的 rewards | 部分确定 | `quest.service.ts:211`、`quest.types.ts:42-48` | TS 声明 `{lingyun?,spiritStones?,jadeSlips?,currencies?,essences?}`，值来自 DB JSON；**额外键会被静默忽略**（`applyBundle` 只读这五个，`quest.service.ts:225-247`），故实际可能含未消费键 → 未确定。 |
| 4 | `quest.detail.quest.dialogues` / `chapter.detail.chapter.dialogues` | 键集合部分确定 | `quest.service.ts:212`；`chapter.service.ts:174`；消费者 `story.service.ts:72-81,97-105` | 类型仅到 `Record<string,string> \| null`；已证实存在的键：任务 `'start'`/`'done'`、章节 `'intro'`/`'outro'`；**是否存在其它键未确定**。 |
| 5 | `story` 节点文本/节点存在性 | 数据驱动 | `story.service.ts:74-106` | 节点是否出现取决于 DB `dialogues` 是否有对应键；节点集合本身随数据变化，非固定枚举。 |
| 6 | `craft` 成功 data 的可选键 | **未确定（分支相关）** | `craft.service.ts:129`（`extra` 初始 `{}`）、`:202,217,229,264,302,342,402`（`data: { item: view, ...extra }`） | `extra` 的键随 `op` 分支出现：`baseStats`(blessed)、`outcome`(vaal: `'empowered'\|'demonic'`)、`baseAffix`(wisp)、`essence`+`guaranteedFamily`(essence)、`mirroredCopyId`(mirror)。**未知 `op` 扩展时是否新增键无法从静态代码穷举**，建议前端按可选字段处理。 |
| 7 | `item.generate` / `craft` 单件渲染的 `createdAt` | 条件出现 | `item.affix.service.ts:431`（`...(createdAt != null ? { createdAt } : {})`） | `generateItem` 不传 createdAt → 无该键；`craft` 传了 DB `created_at` → 有。前端须按可选字段。 |
| 8 | `system.ping` 的信封 | **已确定，但与约定不同** | `health.action.ts:14-21` | 返回裸对象，无 `success`/`message`。前端需特判，不能统一按 `ActionOk` 解析。 |
| 9 | `combat.units[].finalStats` 的键集合 | 部分确定 | `unit.service.ts:172-202` | 基础四键 `hp/atk/def/spiritPower` + 由隐藏词条 `effects` 动态 camelCase 展开（`toCamel`，行 41-43,190-192）→ **键集合随 DB 数据变化**。 |
| 10 | `idle.settle` 正常分支 = `SettlementData` 展开 | 确定（组合） | `idle.service.ts:192-199`（`...settled.data` + 4 个附加键） | 形状为 `SettlementData & {zone, offlineHours, effectiveHours, dailyItemsProduced, dailyItemCap}`；`unit` 在无覆盖且无可用秘境时提前失败。 |
| 11 | REST 失败 HTTP 状态 | 已确定 | `auth.controller`/`character.controller` 无 `@HttpCode`/异常 | 业务失败仍 HTTP 200（只有 Guard 抛 401）。前端不能靠 status code 判业务失败。 |
| 12 | WS 框架层 `errorCode` 取值穷举 | 部分确定 | `ai-docs/ws-protocol-contract.md:5` 节 | 文档给 400/404/500/0，但**框架内部还有其它 errorCode 的可能未被本仓库代码覆盖** → 前端按「非 0 即通道级错误」处理。 |

---

## §7 覆盖度统计

| 维度 | 数量 | 覆盖率 |
|---|---|---|
| REST endpoint | 7 | 7/7 逐字段（含 auth 的 `token`+`user` 已确认） |
| WS Action | 46（12 段） | 46/46 方法名 + 请求字段 + 失败码；成功 data 逐字段 |
| 成功 data 形状 | 46 | 约 43 个已到字段级；`system.ping` 裸对象；`craft` 可选键与 `finalStats` 为数据驱动 |
| 业务错误码 | 51 | 51/51 去重，含 4 个内联构造码的特殊 data |
| 未确定项 | 12 条 | 其中字段级真未知 2 条（#1 baseStats、#6 craft 扩展键），数据驱动/条件出现 7 条 |

---

*本文档为只读分析产物，未修改 `packages/server` 任何源码。*
