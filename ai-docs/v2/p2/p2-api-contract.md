# P2 API 契约 — 功法体系

> 依据：`p2-implementation-plan.md`；响应统一 `{success,message,data}`，错误 `data.code`（HTTP 200 风格，健康探针除外）。

---

## 1. 接口清单

| 方法 | 路径 | 说明 | 门禁 |
| --- | --- | --- | --- |
| GET | /api/game/skills | 功法图鉴（全部功法 + 本人修习状态/等级） | JWT |
| POST | /api/game/skill/learn | 修习（消耗 1 枚未开光玉简，永久入册） | JWT |
| GET | /api/game/skill/panel | 当前 9 槽状态（含协同标记） | JWT |
| PUT | /api/game/skill/panel | 装槽/换装（1 主 3 辅 + 5 术法） | JWT |
| POST | /api/game/skill/enlighten | 参悟升级（消耗灵韵） | JWT |
| POST | /api/game/lingyun/grant | 开发注入灵韵 | JWT + dev 门禁 |
| POST | /api/game/skill/jade-grant | 开发发放未开光玉简 | JWT + dev 门禁 |

dev 门禁 = 生产环境 FORBIDDEN + 与 generate 共用单账户 5 次/分钟限流。

---

## 2. 详情

### 2.1 GET /skills

```
{ "success": true, "message": "获取功法图鉴成功",
  "data": { "skills": [
    { "id": 1, "code": "xinfa_qingyun", "name": "青云心法", "skillType": "xinfa",
      "daoji": "剑", "school": "nei", "spiritCost": 10,
      "description": "剑修入门心法，气随剑走。",
      "learned": true, "level": 3,
      "effectsTexts": ["攻击加成 +4.4%（3级 效果）"] },
    { "id": 5, "code": "shufa_jianqi", "name": "剑气纵横", "skillType": "shufa",
      "daoji": "剑", "school": "wai", "spiritCost": 0,
      "description": "外攻剑诀，剑气纵横三万里。",
      "learned": false, "level": null,
      "effectsTexts": ["技能伤害 100（1级 效果）"] }
  ] } }
```

### 2.2 POST /skill/learn

请求 `{ "skillId": 1 }`；成功：`{ "data": { "skillId":1, "jadeSlips": 剩余 } }`。
失败：SKILL_NOT_FOUND / CHARACTER_NOT_FOUND / ALREADY_LEARNED / JADE_NOT_ENOUGH。

### 2.3 GET /skill/panel

```
{ "success": true, "message": "获取功法面板成功",
  "data": { "panel": {
    "xinfa": { "main": "xinfa_qingyun", "aux": ["xinfa_lihuo"] },
    "shufa": ["shufa_jianqi", "shufa_leigong"],
    "spiritUsed": 30, "spiritBudget": 100,
    "mainDaoji": "剑",
    "synergy": [ { "code": "shufa_jianqi", "matched": true, "text": "道基协同 +20%（占位）" },
                 { "code": "shufa_leigong", "matched": false, "text": "" } ] } } }
```

### 2.4 PUT /skill/panel

请求：`{ "xinfa": { "main": "xinfa_qingyun", "aux": ["xinfa_lihuo","xinfa_tianlei"] }, "shufa": ["shufa_jianqi"] }`
（整组替换；main 可 null；aux ≤3；shufa ≤5）
失败：SKILL_NOT_FOUND / NOT_LEARNED / DUPLICATE_SLOT / SLOT_COUNT_EXCEEDED / SPIRIT_BUDGET_EXCEEDED / MAIN_NOT_NULL_REQUIRED（shufa 空而 main 空的情况不做限制——主心法可空）

### 2.5 POST /skill/enlighten

请求 `{ "skillId": 1 }`；消耗 = enlightenBaseCost × 当前等级；level<20。
失败：SKILL_NOT_FOUND / NOT_LEARNED / MAX_LEVEL_REACHED / LINGYUN_NOT_ENOUGH。
成功：`{ "data": { "skillId":1, "level": 新等级, "lingyun": 剩余 } }`

### 2.6 POST /lingyun/grant（dev）

请求 `{ "amount": 1000 }`（1~1_000_000 整数）；成功返回剩余灵韵。
失败：FORBIDDEN / RATE_LIMITED / INVALID_PARAM。

### 2.7 POST /skill/jade-grant（dev）

请求 `{ "count": 5 }`（1~100）；成功返回剩余玉简。
失败：FORBIDDEN / RATE_LIMITED / INVALID_PARAM。

---

## 3. 错误码新增

| code | 说明 |
| --- | --- |
| SKILL_NOT_FOUND | 功法不存在 |
| ALREADY_LEARNED | 已修习（幂等提示） |
| NOT_LEARNED | 未修习 |
| JADE_NOT_ENOUGH | 玉简不足 |
| LINGYUN_NOT_ENOUGH | 灵韵不足 |
| MAX_LEVEL_REACHED | 已达等级上限 |
| DUPLICATE_SLOT | 槽内 code 重复 |
| SLOT_COUNT_EXCEEDED | 槽位数量超限（辅>3 或 术法>5） |
| SPIRIT_BUDGET_EXCEEDED | 辅心法神识超预算 |
| SLOTS_INVALID | slots 结构非法 |

---

## 4. 冒烟清单

1. jade-grant 5 → learn 4 心法 + 5 术法（9 枚不够 → 期间出现 JADE_NOT_ENOUGH 再 grant）
2. 重复 learn → ALREADY_LEARNED
3. PUT panel 装 1 主 3 辅（神识 10+20+40=70≤100）→ 成功；辅换 80 档（10+20+80=110）→ SPIRIT_BUDGET_EXCEEDED
4. 装未修习 code → NOT_LEARNED；重复 code → DUPLICATE_SLOT；术法 6 个 → SLOT_COUNT_EXCEEDED
5. lingyun-grant 210 → enlighten 1→2 耗 100、2→3 耗 200（剩 10）→ LINGYUN_NOT_ENOUGH → 3→4 失败
6. 图鉴 learned/level 正确；panel synergy 标记与 mainDaoji 一致
7. dev 门禁：grant 第 6 次 → RATE_LIMITED
8. /api/health 回归 200；typecheck/build 零错误
