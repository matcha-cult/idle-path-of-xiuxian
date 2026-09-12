# P2 种子规格 — 功法（4 心法 + 5 术法）

> 字段与重灌方式随 `p2-implementation-plan.md` §3；显式 id 1~9，重灌不清玩家 learned/panels。

---

## 1. skills.json 字段

```jsonc
{
  "id": 1,
  "code": "xinfa_qingyun",
  "name": "青云心法",
  "skillType": "xinfa",            // xinfa / shufa
  "daoji": "剑",
  "school": "nei",                  // 心法恒 nei；术法 wai 外功 / nei 内功
  "spiritCost": 10,                 // 心法 10/20/40/80；术法 0
  "effects": { "atk_pct": 4 },      // 1 级效果（% 键为数值百分比）
  "growthRate": 0.05,               // 每级 +5%（L 级效果 = base × (1 + 0.05 × (L-1))）
  "description": "剑修入门心法，气随剑走。"
}
```

---

## 2. 心法清单（4 部，神识档位覆盖 10/20/40/80）

| id | code | 名称 | 道基 | 神识 | effects（1级） | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | xinfa_qingyun | 青云心法 | 剑 | 10 | atk_pct +4% | 入门辅心法（主辅皆可） |
| 2 | xinfa_lihuo | 离火心经 | 火 | 20 | atk_pct +8% | 火系攻伐 |
| 3 | xinfa_tianlei | 天雷锻体诀 | 雷 | 40 | hp_pct +10% | 雷系淬体 |
| 4 | xinfa_jiuzhuan | 九转玄功 | 体 | 80 | all_stats_pct +5% | 顶级道基（预算吃紧） |

---

## 3. 术法清单（5 部，覆盖 剑/雷/火/冰/体）

| id | code | 名称 | 道基 | 流派 | effects（1级） | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | shufa_jianqi | 剑气纵横 | 剑 | wai | skill_damage 100 | 外功剑诀 |
| 6 | shufa_leigong | 五雷轰顶 | 雷 | nei | skill_damage 120 | 内功雷法 |
| 7 | shufa_liaoyuan | 燎原之火 | 火 | nei | skill_damage 110 | 内功火法 |
| 8 | shufa_bingfeng | 霜天冰狱 | 冰 | nei | skill_damage 105 | 内功冰法 |
| 9 | shufa_tipo | 破山拳 | 体 | wai | skill_damage 95 | 外功体术 |

> 阵/丹/符三标签预留（⑤A 允许的标签集合内），P2 无对应功法；后续扩张改 JSON。

---

## 4. 配套配置（config/app.config.json 新增）

```jsonc
"spiritBudget": 100,          // 辅心法神识总预算
"maxSkillLevel": 20,          // 参悟等级上限
"enlightenBaseCost": 100,     // 参悟消耗 = enlightenBaseCost × 当前等级（1→2 耗 100）
"synergyBonusPct": 20,        // 主心法道基一致的术法协同加成（占位展示）
"devToolRateLimitPerMinute": 5 // generate / lingyun-grant / jade-grant 共用限流
```

---

## 5. 等级效果速查（growthRate 0.05）

| 等级 | 乘数 | 青云心法 atk_pct | 剑气纵横 skill_damage |
| --- | --- | --- | --- |
| 1 | 1.00 | 4% | 100 |
| 5 | 1.20 | 4.8% | 120 |
| 10 | 1.45 | 5.8% | 145 |
| 20 | 1.95 | 7.8% | 195 |
