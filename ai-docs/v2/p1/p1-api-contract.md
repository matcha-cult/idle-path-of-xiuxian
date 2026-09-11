# P1 API 契约 — 物品与词缀

> 依据：`../xiuxian-design-v2.md` §12 与 `p1-implementation-plan.md`
> 所有接口 JWT 认证，响应统一 `{ success, message, data }`。

---

## 1. 通用约定

- 前缀：`/api/game`
- 认证：Authorization: Bearer <token>，经 `JwtAuthGuard` + `@UserId()`
- 用户 → 角色：服务端经 CharacterService 解析 character_id
- 分页：`page`（1 起）、`pageSize`（默认 20，上限 100）
- 错误码字段：失败时 `data.code`（见 §5）

---

## 2. 接口清单

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/game/inventory | 背包列表 |
| GET | /api/game/inventory/:id | 物品详情 |
| POST | /api/game/item/equip | 装备 |
| POST | /api/game/item/unequip | 卸下 |
| POST | /api/game/item/discard | 丢弃（P1 物理删除） |
| GET | /api/game/equipment | 当前装备栏 |
| GET | /api/game/item/bases | 基底库查询 |
| POST | /api/game/item/generate | 生成物品（开发/测试） |
| GET | /api/game/pickup-rules | 辨宝法阵列表 |
| POST | /api/game/pickup-rules | 新建规则 |
| PUT | /api/game/pickup-rules/:id | 修改规则 |
| DELETE | /api/game/pickup-rules/:id | 删除规则 |

---

## 3. 详情

### 3.1 GET /inventory

Query：`category`、`rarity`（0~3）、`tierMin`、`tierMax`、`page`、`pageSize`

响应：

```
{
  "success": true, "message": "获取背包成功",
  "data": {
    "total": 3, "page": 1, "pageSize": 20,
    "items": [
      {
        "id": 12, "baseId": 2, "baseCode": "t2_qingfengjian",
        "name": "青锋剑", "category": "weapon", "slot": "weapon",
        "rarity": 2, "rarityName": "宝品", "tier": 2, "quality": 0,
        "status": "bag",
        "affixTexts": ["锋芒（基底）：攻击 +5%", "锋锐 T2：攻击 +5", "破甲 T1：暴击 +0.8%"],
        "createdAt": "2025-07-17T08:00:00Z"
      }
    ]
  }
}
```

### 3.2 GET /inventory/:id

响应 data：同 3.1 item 全量 + `affixes`（原始列表 `[{pol,code,name,tier,value}]`）。

错误：`ITEM_NOT_FOUND`、`ITEM_NOT_OWNED`（404/403）。

### 3.3 POST /item/equip

请求：`{ "itemId": 12 }`（槽位根据物品 slot 自动决定；戒指两槽位冲突时报 SLOT_OCCUPIED）

成功：

```
{ "success": true, "message": "装备成功：青锋剑 已佩戴至 weapon",
  "data": { "slot": "weapon", "slots": { "weapon": 12 } } }
```

失败：`ITEM_NOT_FOUND` / `ITEM_NOT_OWNED` / `ITEM_NOT_IN_BAG` / `TIER_TOO_HIGH`（物品 tier > 角色境界）/ `REALM_TOO_LOW`。

> 约定：境界校验错误码统一 `TIER_TOO_HIGH`，message 携带“当前境界 X，物品 T Y”。

### 3.4 POST /item/unequip

请求：`{ "itemId": 12 }`；成功 data 同 3.3（slots 中该槽位回 null）。
失败：`ITEM_NOT_EQUIPPED`。

### 3.5 POST /item/discard

请求：`{ "itemId": 12, "count": 1 }`（P1 装备类 count 恒为 1）。
成功：`{ "success": true, "message": "已丢弃 青锋剑" }`。
失败：`ITEM_NOT_FOUND` / `ITEM_NOT_OWNED`。

### 3.6 GET /equipment

```
{ "success": true, "message": "获取装备栏成功",
  "data": { "slots": {
      "weapon": { "id": 12, "name": "青锋剑", "rarity": 2, "tier": 2 },
      "body": null, "helmet": null, "gloves": null, "boots": null,
      "shield": null, "ring1": null, "ring2": null, "amulet": null, "belt": null },
    "equippedCount": 1 } }
```

### 3.7 GET /item/bases

Query：`category`、`tier`、`page`、`pageSize`
data：基底行（不含池详情）+ `affixPoolSummary`（可选参数 `withPool=1` 时输出前缀/后缀 code 列表）。

### 3.8 POST /item/generate（开发/测试，仅 POST）

> 2025-09-12 审阅修正后修订：仅 POST（GET 变体已移除）；生产环境禁用（`FORBIDDEN`）；
> `characterId` 只允许当前登录用户本人的角色 id，或省略（无主物品，character_id=null）；
> 单账户限流（默认 5 次/分钟，超限 `RATE_LIMITED`）。

请求：`{ "baseId": 2, "rarity": 2, "characterId": 3 }`（characterId 省略时落库为无主物品）。

成功响应示例：

```
{ "success": true, "message": "生成成功：青锋剑（宝品）",
  "data": { "item": {
      "id": 13, "name": "青锋剑", "rarity": 2, "tier": 2,
      "affixTexts": ["锋芒（基底）：攻击 +5%",
                     "锋锐 T2：攻击 +5", "蕴灵 T1：灵力 +3",
                     "破甲 T1：暴击 +0.7%", "盈灵 T2：灵力加成 +1.3%"] } } }
```

失败：`BASE_NOT_FOUND` / `RARITY_EXCEEDS_LIMIT`（目标稀有度 > 基底 rarityLimit）/ `INVALID_PARAM`（baseId/rarity 缺失或非法）/ `FORBIDDEN`（生产环境或越权角色）/ `RATE_LIMITED`（超限流）。

### 3.9 pickup-rules CRUD

- GET 列表：`{ rules: [...] }`（同 seed 字段）
- POST：`{ name, rarityMin, tierMin, affixCodes?, action, priority }`
- PUT：同 POST，可部分字段
- DELETE：物理删除
- 失败码：`PICKUP_RULE_NOT_FOUND`
- 注：系统预置模板（character_id=0）不返回给用户；复制到角色的时机在 P4（掉落结算）。当前新角色规则列表为空属预期行为。

---

## 4. 装备槽位与物品类别枚举

| slot key | 说明 |
| --- | --- |
| weapon | 武器（单手/双手共用一个槽） |
| body / helmet / gloves / boots / shield | 各一槽 |
| ring1 / ring2 | 两枚戒指分别占槽 |
| amulet / belt | 各一槽 |

---

## 5. 错误码总表

| code | HTTP | 说明 |
| --- | --- | --- |
| ITEM_NOT_FOUND | 404 | 物品不存在 |
| ITEM_NOT_OWNED | 403 | 不属于当前角色 |
| ITEM_NOT_IN_BAG | 409 | 状态非 bag |
| ITEM_NOT_EQUIPPED | 409 | 未被装备 |
| SLOT_OCCUPIED | 409 | 槽位已占用 |
| TIER_TOO_HIGH | 409 | 物品 tier 超过角色境界 |
| BASE_NOT_FOUND | 404 | 基底不存在 |
| RARITY_EXCEEDS_LIMIT | 409 | 超出基底稀有度上限 |
| FORBIDDEN | 403 | 越权角色/生产环境禁用（generate） |
| RATE_LIMITED | 429 | 超出限流（generate，默认 5 次/分钟） |
| INVALID_PARAM | 400 | 参数缺失或非法（含 NaN 防御） |
| PICKUP_RULE_NOT_FOUND | 404 | 规则不存在 |

---

## 6. 冒烟清单（curl 顺序）

1. 登录拿 token
2. `GET /api/game/item/bases?tier=2` → 返回青锋剑等
3. `POST /api/game/item/generate {"baseId":2,"rarity":2}` → 词缀 tier ∈ [1,2]
4. 对同一 baseId 生成 20 次 → 词缀数 3~6、前缀 ≤3、后缀 ≤3
5. `POST /api/game/item/equip` 用低于需求的境界角色装备 T8 物品 → TIER_TOO_HIGH
6. 正常装备 → `GET /api/game/equipment` → slot 显示
7. 卸下 → 丢弃 → `GET /api/game/inventory` 中不再出现
8. pickup-rules CRUD 四连
