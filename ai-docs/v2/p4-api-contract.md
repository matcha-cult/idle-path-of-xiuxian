# P4 API 契约 — 单位与掉落结算（P4.1）

> 通用：JWT；响应 { success, message, data }；错误 data.code（HTTP 200 风格）
> ★dev：生产环境 NODE_ENV=production → FORBIDDEN；与 generate/lingyun-grant 等共享限流（5 次/分/账户）

## 1. GET /api/game/units（单位图鉴）

查询：`realm`（可选）、`camp`（可选 hostile/neutral/friendly）

```json
{ "success": true, "message": "获取单位图鉴成功",
  "data": { "total": 23, "units": [
    { "id": 1, "code": "u_r1_shanxiao", "name": "山魈鬼", "realm": 1, "realmName": "铜皮",
      "camp": "hostile", "givesLingyun": true, "dropTable": "dt_band1",
      "baseStats": { "hp": 60, "atk": 8, "def": 4, "spiritPower": 5 },
      "hiddenPool": ["hid_hp", "hid_atk"], "lingyunReward": 5 } ] } }
```

## 2. GET /api/game/drop-tables（掉落表图鉴）

```json
{ "success": true, "message": "获取掉落表成功",
  "data": { "total": 9, "tables": [
    { "id": 1, "code": "dt_band1", "name": "第一章·初入仙途", "dropsPerKill": 1, "tierOffset": 0,
      "entries": [
        { "kind": "base", "baseTier": 1, "rarity": 0, "weight": 100 },
        { "kind": "currency", "currencyCode": "alchemy", "minCount": 1, "maxCount": 1, "weight": 3 } ] } ] } }
```

## 3. POST /api/game/unit/spawn ★dev（即时实例化）

请求：`{ "code": "u_r1_shanxiao", "hiddenCount": 2 }`（hiddenCount 可选 0~6，缺省按 config [1,3] 随机）

```json
{ "success": true, "message": "实例化成功：山魈鬼（铜皮）",
  "data": { "unit": {
    "code": "u_r1_shanxiao", "name": "山魈鬼", "realm": 1, "realmName": "铜皮", "camp": "hostile",
    "givesLingyun": true, "dropTable": "dt_band1",
    "baseStats": { "hp": 60, "atk": 8, "def": 4, "spiritPower": 5 },
    "hiddenAffixes": [ { "code": "hid_hp", "name": "厚甲", "effects": { "hp_pct": 30 } } ],
    "finalStats": { "hp": 78, "atk": 8, "def": 4, "spiritPower": 5, "crit": 0, "extraDamagePct": 0, "resistPct": 0 },
    "lingyunReward": 5 } } }
```

失败码：UNIT_NOT_FOUND / INVALID_PARAM / FORBIDDEN / RATE_LIMITED / CHARACTER_NOT_FOUND

## 4. POST /api/game/unit/kill ★dev（掉落结算 + 辨宝法阵）

请求：`{ "code": "u_r1_shanxiao", "count": 10 }`（count 1~`maxKillsPerRequest`，缺省 1）

```json
{ "success": true, "message": "击杀结算完成：山魈鬼 ×10",
  "data": {
    "unit": { "code": "u_r1_shanxiao", "name": "山魈鬼", "realm": 1 },
    "kills": 10,
    "lingyunGained": 50, "lingyunTotal": 350,
    "items": [ { "id": 12, "name": "桃木剑", "rarity": 2, "tier": 1, "affixTexts": ["+8 攻击"] } ],
    "kept": 2, "salvaged": { "count": 6, "lingyun": 30 }, "sold": { "count": 2, "spiritStones": 40 },
    "discarded": 0, "blockedByTier": 0,
    "currencies": { "transmute": 1 }, "essences": { "ess_atk": 1 } } }
```

- 掉落物品先落 bag，再按辨宝法阵判定；非 keep 的物品已从库中移除（仅返回汇总计数）。
- `items` 仅列 keep 的入包物品（最多 50 条）。
- `currencies`/`essences` 为本次掉落累加量。

失败码：UNIT_NOT_FOUND / NOT_KILLABLE（中立/友方）/ INVALID_PARAM / FORBIDDEN / RATE_LIMITED / CHARACTER_NOT_FOUND

## 5. 冒烟顺序

见 p4-plan.md §8（1~8）。
