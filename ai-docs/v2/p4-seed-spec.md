# P4 种子规格 — 单位 / 隐藏词条 / 掉落表

> 落库脚本：packages/server/scripts/init-game-db.mjs
> 目录：packages/server/prisma/seeds/game/
> 约定：全部显式 id；重灌前清配置表；玩家实例数据（game_items/game_wallets/game_essence_inventory）保留

---

## 1. unit-hidden-affixes.json（隐藏词条定义）

```jsonc
{ "id": 1, "code": "hid_hp", "name": "厚甲",
  "effects": { "hp_pct": 30 }, "weight": 100 }
```

| effects 键 | 类型 | 作用 |
| --- | --- | --- |
| hp_pct / atk_pct / def_pct / spirit_power_pct / atk_speed_pct / all_stats_pct | 乘法 % | 对应战斗属性 ×(1+v/100) |
| crit / extra_damage_pct / resist_pct / lingyun_gain | 附加 | 结果字段平铺保留 |

id 1~11：hid_hp 厚甲 / hid_atk 凶戾 / hid_def 铁鳞 / hid_spirit 灵犀 / hid_speed 疾风 / hid_crit 致命 / hid_extra 暴虐 / hid_resist 抗法 / hid_regen 再生 / hid_all 混元 / hid_lingyun 聚灵。

## 2. unit-templates.json（单位模板）

```jsonc
{ "id": 1, "code": "u_r1_shanxiao", "name": "山魈鬼", "realm": 1, "camp": "hostile",
  "givesLingyun": true, "baseStats": null, "hiddenPool": ["hid_hp","hid_atk"],
  "dropTable": "dt_band1" }
```

- camp ∈ hostile / neutral / friendly；neutral/friendly 的 givesLingyun=false 且 dropTable=null。
- baseStats 为 null 时取境界模板；非 null 时覆盖对应字段。
- hiddenPool 引用 unit-hidden-affixes.code；dropTable 引用 drop-tables.code（落库解析为 drop_table_ref）。

**名册（23）**

| realm | hostile | 掉落表 |
| --- | --- | --- |
| 1 | u_r1_shanxiao 山魈鬼 | dt_band1 |
| 2 | u_r2_pojiaolang 破角妖狼 | dt_band1 |
| 3 | u_r3_shigu 石骨傀儡 | dt_band1 |
| 4 | u_r4_xueyan 血眼魔修 | dt_band2 |
| 5 | u_r5_tongmo 铜魔卫 | dt_band2 |
| 6 | u_r6_dilong 洞府地脉蟒 | dt_band2 |
| 7 | u_r7_jiaomo 观海鲛魔 | dt_band3 |
| 8 | u_r8_longmenjiao 龙门蛟妖 | dt_band3 |
| 9 | u_r9_jindanmo 金丹魔将 | dt_band3 |
| 10 | u_r10_guiwang 元婴鬼帝 | dt_band4 |
| 11 | u_r11_yupu 玉璞邪修 | dt_band4 |
| 12 | u_r12_xianrenyao 仙人妖尊 | dt_band4 |
| 13 | u_r13_feishengmo 飞升魔祖 | dt_band5 |
| 14 | u_r14_hedaoxie 合道邪神 | dt_band5 |
| Boss 3 | u_boss_yaowang 妖王 | dt_boss1 |
| Boss 6 | u_boss_dongfuzhu 洞府主 | dt_boss2 |
| Boss 9 | u_boss_mowang 魔王 | dt_boss3 |
| Boss 14 | u_boss_hundun 混沌异兽 | dt_boss4 |

中立（givesLingyun=false）：npc_fangshi 坊市商人 / npc_yaonong 药农 / npc_zhujianshi 铸剑师。
友方（givesLingyun=false）：npc_shixiong 同门师兄 / npc_yinlu 引路人。

## 3. drop-tables.json（掉落表）

```jsonc
{ "id": 1, "code": "dt_band1", "name": "第一章掉落", "dropsPerKill": 1, "tierOffset": 0,
  "entries": [
    { "kind": "base", "baseTier": 1, "rarity": 0, "weight": 100 },
    { "kind": "base", "baseTier": 1, "rarity": 1, "weight": 40 },
    { "kind": "base", "baseTier": 2, "rarity": 0, "weight": 80 },
    { "kind": "base", "baseTier": 2, "rarity": 1, "weight": 30 },
    { "kind": "base", "baseTier": 3, "rarity": 0, "weight": 60 },
    { "kind": "base", "baseTier": 3, "rarity": 1, "weight": 20 },
    { "kind": "currency", "currencyCode": "transmute", "minCount": 1, "maxCount": 1, "weight": 8 },
    { "kind": "currency", "currencyCode": "alchemy", "minCount": 1, "maxCount": 1, "weight": 3 },
    { "kind": "essence", "essenceCode": "ess_atk", "minCount": 1, "maxCount": 1, "weight": 3 },
    { "kind": "essence", "essenceCode": "ess_hp", "minCount": 1, "maxCount": 1, "weight": 3 }
  ] }
```

**表清单（9）**

| code | 名称 | dropsPerKill | tierOffset | 覆盖 T |
| --- | --- | --- | --- | --- |
| dt_band1 | 第一章·初入仙途 | 1 | 0 | 1~3 |
| dt_band2 | 第二章·下山历练 | 1 | 0 | 4~6 |
| dt_band3 | 第三章·秘境夺宝 | 1 | 0 | 7~9 |
| dt_band4 | 第四章·大劫将临 | 1 | 0 | 10~12 |
| dt_band5 | 第五章·飞升前夜 | 1 | 0 | 13~14 |
| dt_boss1 | 妖王 | 3 | 1 | 1~4 |
| dt_boss2 | 洞府主 | 3 | 1 | 4~7 |
| dt_boss3 | 魔王 | 3 | 2 | 7~11 |
| dt_boss4 | 混沌异兽 | 3 | 2 | 12~14 |

- 每个阶梯表按覆盖 T 逐阶配 rarity 0/1 条目；Boss 表追加 rarity 2 条目与更高权重通货/精华。
- tierOffset 仅放宽「本表允许掉落的最高 T」；实际底材 T 由条目 baseTier 决定。

## 4. 落库映射

| seed | 表 |
| --- | --- |
| unit-hidden-affixes.json | game_unit_hidden_affixes（code 冲突 UPDATE name/effects/weight） |
| unit-templates.json | game_unit_templates（dropTable → drop_table_ref；hiddenPool → game_unit_hidden_pools） |
| drop-tables.json | game_drop_tables + game_drop_entries |

孤儿校验：单位 drop_table_ref 指向不存在的表 → 告警；隐藏池引用不存在的词条 → 告警。
