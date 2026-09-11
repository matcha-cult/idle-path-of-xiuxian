# P1 种子数据规格 — 物品基底 / 词缀 / 词缀池

> 依据：`../xiuxian-design-v2.md` §3、§11 与 `p1-implementation-plan.md`
> 编号规则见各节。所有数值均可调整，改 JSON 不动代码。

---

## 1. 种子文件位置与格式

```
packages/server/prisma/seeds/game/
├── item-bases.json          // 物品基底
├── affixes.json             // 词缀池（可 roll 词缀 + 基底词缀 + 传奇固定词缀）
├── base-affix-pools.json    // 底材 → 词缀池挂载
└── pickup-rules.json        // 预置辨宝法阵规则
```

---

## 2. 基底基础属性公式（按类别）

基底 `base_stats` 由类别 × tier 的公式生成，seed 文件内直接落值：

| 类别 | 槽位 | 属性公式（t = tier） |
| --- | --- | --- |
| 单手武器 | weapon | atk = 8 + 6t；atk_speed = 100 |
| 双手武器 | weapon | atk = 14 + 10t；atk_speed = 70 |
| 胸甲 | body | hp = 30 + 15t；def = 4 + 2t |
| 头盔 | helmet | hp = 12 + 6t；def = 3 + 1.5t |
| 手套 | gloves | hp = 10 + 5t；def = 2 + t |
| 云靴 | boots | hp = 10 + 5t；def = 2 + t |
| 盾牌 | shield | def = 10 + 4t；hp = 20 + 10t |
| 戒指 | ring | atk = 2 + t，spirit_power = 2 + t |
| 护符 | amulet | hp = 15 + 7t，spirit_power = 2 + 2t |
| 灵带 | belt | hp = 12 + 6t；def = 2 + t |

> 数值为 P1 占位规格，后续由数值策划统一调平；公式只进种子文件。

---

## 3. item-bases.json 规格

### 3.1 字段

```
{
  "code": "t1_taomujian",           // 唯一
  "name": "桃木剑",
  "category": "weapon",             // weapon/body/helmet/gloves/boots/shield/ring/amulet/belt
  "slot": "weapon",
  "subType": "单手剑",
  "tier": 1,                        // 1~14
  "baseStats": { "atk": 14, "atkSpeed": 100 },
  "implicitAffixes": [],            // 基底词缀 code 列表（可空）
  "uniqueAffixes": [],              // 传奇固定词缀 code 列表（仅传奇基底非空）
  "rarityLimit": 2,                 // 凡品=1 灵品=2 宝品=3（代码约定：0凡1灵2宝3传奇，见实现计划）
  "dropWeight": 100
}
```

> 注：rarityLimit 采用「最高可达稀有度数值」：0=仅凡品、1=至灵品、2=至宝品、3=传奇。P1 中**仅 1 件物品 rarityLimit=3**（验证传奇路径），其余最多到 2。

### 3.2 基底清单（每境 3 件：武器 + 防具 + 首饰）

| tier | 武器（subType） | 防具（槽位） | 首饰（槽位） |
| --- | --- | --- | --- |
| 1 | 桃木剑（单手剑） | 粗麻道袍（body） | 山桃核串（ring） |
| 2 | 青锋剑（单手剑） | 藤甲（body） | 铜钱护符（amulet） |
| 3 | 精铁剑（单手剑） | 铁叶内甲（body） | 青玉环（ring） |
| 4 | 柳叶刀（单手刀） | 护心衣（body） | 暖玉佩（amulet） |
| 5 | 斩妖刀（单手刀） | 锁子甲（body） | 玄铁腰牌（belt） |
| 6 | 追风棍（双手棍） | 洞府法衣（body） | 观海珠链（amulet） |
| 7 | 云纹枪（双手长枪） | 金丝内甲（body） | 龙门瑞玉（ring） |
| 8 | 破浪刀（单手刀） | 玄武重甲（body） | 金丹葫芦（amulet） |
| 9 | 元阳枪（双手长枪） | 元婴法袍（body） | 星辰戒（ring） |
| 10 | 裂空剑（单手剑） | 玉璞冠（helmet） | 仙风腰带（belt） |
| 11 | 仙人尺（单手尺） | 天机法衣（body） | 云纹灵靴（boots） |
| 12 | 渡劫剑（单手剑） | 雷劫战甲（body） | 天雷护腕（gloves） |
| 13 | 飞升仙剑（单手剑） | 九霄法衣（body） | 飞升玉镯（ring） |
| 14 | 合道神兵（双手重剑） | 混沌道袍（body） | 合道天印（amulet） |

共 42 件，其中 T14 的「合道神兵」`rarityLimit=3`、`uniqueAffixes` 非空（示例传奇路径），其余 rarityLimit=2。

**基底词缀（implicitAffixes）示例**（P1 仅 4 件配置，验证复制逻辑）：

| 基底 | 基底词缀 code | 效果 |
| --- | --- | --- |
| t2_qingfengjian 青锋剑 | base_fengmang | 锋芒：持有者攻击 +5%（固定） |
| t6_zhuifenggun 追风棍 | base_xunfeng | 迅风：攻速 +8%（固定） |
| t8_polangdao 破浪刀 | base_shuiling | 水灵：灵力 +15（固定） |
| t14_hedaoshenbing 合道神兵 | base_hedao | 合道：全属性 +5%（固定） |

---

## 4. affixes.json 规格

### 4.1 字段

```
{
  "code": "aff_atk_01",             // 唯一；01 为词缀族序号
  "name": "锋锐",
  "polarity": "prefix",             // prefix / suffix / base
  "tier": 1,                        // 1~14；base 与传奇固定词缀 tier=0
  "effects": { "atk": 12 },         // P1 固定值；数值 roll 见 valueFunc
  "valueFunc": { "minPerTier": 2, "maxPerTier": 3 },
  "weight": 120,
  "isFractured": false
}
```

- `effects`：P1 中始终为 valueFunc 按 tier 算出后的落地值（生成器直接读 `valueFunc` 计算，`effects` 仅作文档占位）。
- 实际 roll 值 = `uniform(minPerTier×t, maxPerTier×t)` 取整（百分比字段 1 位小数）。

### 4.2 可 roll 词缀清单（12 族 × 14 阶 = 168 行）

| 极性 | code 族 | 名称 | 效果键 | minPerTier | maxPerTier | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| prefix | aff_atk | 锋锐 | atk | 2 | 3 | 攻击 |
| prefix | aff_spirit | 蕴灵 | spirit_power | 2 | 3 | 灵力 |
| prefix | aff_def | 御土 | def | 1 | 2 | 防御 |
| prefix | aff_hp | 太一 | hp | 8 | 12 | 生命 |
| prefix | aff_speed | 迅影 | atk_speed | 1 | 2 | 攻速 |
| prefix | aff_move | 神行 | move_speed | 1 | 2 | 移速 |
| suffix | aff_regen | 回春 | hp_regen | 1 | 2 | 生命回复 |
| suffix | aff_lingyun | 悟性 | lingyun_gain | 1 | 2 | 灵韵获取 |
| suffix | aff_focus | 凝神 | focus | 1 | 2 | 神识 |
| suffix | aff_crit | 破甲 | crit | 0.5 | 1 | 暴击%（1 位小数） |
| suffix | aff_spiritpct | 盈灵 | spirit_power_pct | 0.5 | 1 | 灵力加成%（1 位小数） |
| suffix | aff_allstats | 均衡 | all_stats | 0.25 | 0.5 | 全属性 |

### 4.3 基底词缀（polarity=base，tier=0，4 行）

| code | 名称 | 效果 |
| --- | --- | --- |
| base_fengmang | 锋芒 | atk 加成 +5%（`spirit_power_pct` 类百分比，实施时扩展效果键 `atk_pct`） |
| base_xunfeng | 迅风 | atk_speed 加成 +8%（`atk_speed_pct`） |
| base_shuiling | 水灵 | spirit_power +15（固定值） |
| base_hedao | 合道 | all_stats +5%（`all_stats_pct`） |

> P1 效果键表在 v2 §3.6 基础上补充百分比键：`atk_pct`、`atk_speed_pct`、`all_stats_pct`。渲染时按键名映射中文。

### 4.4 传奇固定词缀（tier=0，3 行，仅合道神兵用）

| code | polarity | 效果 |
| --- | --- | --- |
| leg_hedao_chenda | prefix | 沉大道：atk +60（固定） |
| leg_hedao_pomo | prefix | 破魔：对魔修增伤 50%（P1 仅落库展示，不参与战斗计算） |
| leg_hedao_woming | suffix | 我命：hp +300、hp_regen +20 |

---

## 5. base-affix-pools.json 规格

### 5.1 池组定义（减少重复配置）

| 池组 | 适用类别 | 前缀池 | 后缀池 |
| --- | --- | --- | --- |
| weapon | weapon | 锋锐/蕴灵/迅影/神行 | 破甲/盈灵/凝神 |
| armor | body/helmet/gloves/boots/shield/belt | 御土/太一/蕴灵 | 回春/均衡/凝神 |
| jewelry | ring/amulet | 蕴灵/神行/锋锐 | 盈灵/悟性/凝神 |

### 5.2 展开规则

每件基底按 category 落入一个池组，池内词缀全部挂载为一行
`{ baseCode, affixCode, polarity }`；同一 affix 只挂一次（跨 tier 全量挂载，tier 过滤在生成器执行）。

例外：`t14_hedaoshenbing` 额外挂载 `leg_*` 三行（其三种极性），供传奇生成路径使用。

---

## 6. pickup-rules.json（预置规则)

```
{
  "characterId": 0,             // 0 = 系统预置模板（复制给新角色用）
  "name": "默认辨宝",
  "rarityMin": 2,               // 宝品及以上保留
  "tierMin": 1,
  "affixCodes": [],
  "action": "keep",
  "enabled": true,
  "priority": 100
}
```

> P1 只落库 1 条系统预置模板；复制到角色的时机在 P4（掉落结算时）。
