# P3 API 契约 — 通货与炼器（第一批）

> 通用：JWT；响应 {success,message,data}；错误 data.code（HTTP 200 风格）

## 1. GET /api/game/currencies（通货图鉴）

```
{ "success": true, "message": "获取通货图鉴成功",
  "data": { "currencies": [
    { "id": 1, "code": "chaos", "name": "混沌石", "description": "重roll当前品阶的词条数与词缀",
      "implemented": true, "owned": 3 } ] } }
```

## 2. POST /api/game/currency/grant（dev）

请求 {code, count}；count 1~9999；生产禁用 FORBIDDEN；共享限流 RATE_LIMITED（第 6 次/分）；code 非法 CURRENCY_NOT_FOUND。
成功：{ data: { code, amount } }

## 3. POST /api/game/item/craft（炼器统一入口）

请求 {itemId, op}，op ∈ transmute/alchemy/chaos/exalt/annul/scour/divine。

成功：{ success, message:"炼器成功：青锋剑（灵品）", data:{ item } }（item 复用 P1 ItemView 形状，含新 affixTexts）

失败码：

| code | 场景 |
| --- | --- |
| INVALID_OP | op 非法 |
| ITEM_NOT_FOUND / ITEM_NOT_OWNED | 物品问题 |
| LEGENDARY_IMMUTABLE | 传奇不可洗炼 |
| RARITY_MISMATCH | 前提品阶不符 |
| NOT_ENOUGH_CURRENCY | 对应通货不足 |
| NO_AFFIX_TO_REMOVE | annul 无可剥离词缀 |
| MAX_AFFIXES | exalt 已达 6 条上限（或灵品双满） |
| CURRENCY_NOT_FOUND | grant code 不存在 |

## 4. 冒烟顺序

见 p3-plan.md §5（1~9）。
