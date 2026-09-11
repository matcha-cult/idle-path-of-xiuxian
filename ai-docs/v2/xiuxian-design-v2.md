# 放置·修仙之路 — 完整设计文档 v2

> 文档状态：草案（基于第 1 轮设定修订）
> 工作区：<workspace>
> 本文件为全新独立文档，不引用旧版设计文档。

---

## 1. 项目定位与设计方向

### 1.1 项目定位

「放置·修仙之路」是一款修仙题材的放置挂机游戏。技术架构为 ionet-ts + NestJS + PostgreSQL（Prisma）。

### 1.2 核心设计方向（本轮确定）

1. **角色无等级，只有境界**。不存在战斗中临时突破设定。
2. **所有对战单位以境界模板为基准**，采用隐藏词条进行属性调整（与 PoE 怪物设计一致）。单位分敌对/中立/友方三种阵营，部分单位击杀后产出灵韵。所有单位由种子文件定义。
3. **剧情最多 5 章**。任务由种子文件配置，任务逻辑服处理流转。任务触发与 PoE 一致——不需要主动接取（特殊触发流程除外）。
4. **灵石为基础货币**，引入 PoE 部分通货扩充，用于炼器（加工装备）和炼丹（炼制灵药）。
5. **词缀 T 阶数字越大数值越高**（与 PoE 相反），T14 为最高阶。底材等阶限定可 roll 的 T 阶范围（上下限均限定，低 T 阶被高等级底材排除）。
6. **每种底材有独立的前缀池和后缀池**，不再使用「阳铭」「阴铭」术语。

---

## 2. 境界体系

### 2.1 境界定义

角色无等级，成长维度仅以**境界**衡量。境界共 14 境，玩家封顶 14 境。

| 阶段 | 序号 | 境界名称 | 说明 |
| --- | --- | --- | --- |
| 下五境 | 1 | 铜皮 | 新手期，肉身淬炼 |
| | 2 | 草根 | 血肉恢复能力出众 |
| | 3 | 柳筋 | 经脉坚韧，功法运转顺畅 |
| | 4 | 骨气 | 骨骼坚硬，内蕴基础 |
| | 5 | 铸炉 | 以肉身为炉鼎 |
| 中五境 | 6 | 洞府 | 体内开辟洞府空间 |
| | 7 | 观海 | 真气如海 |
| | 8 | 龙门 | 关键门槛，突破后实力大幅提升 |
| | 9 | 金丹 | 结丹 |
| | 10 | 元婴 | 识海育阳神/阴神 |
| 上四境 | 11 | 玉璞 | 返璞归真 |
| | 12 | 仙人 | 大神通者 |
| | 13 | 飞升 | 破境被天道察觉，天劫降临 |
| | 14 | 合道 | 内演天地、合道己道（玩家封顶） |

### 2.2 突破规则

- 突破消耗灵韵。灵韵消耗后不返还。
- 每境所需灵韵量由种子文件配置，可使用递增公式预设。
- **突破失败无任何惩罚**：不损失材料、不损失进度、不降境。可无限次尝试。
- **不存在战斗中临时突破**。
- 飞升天劫：渡劫失败同样无惩罚，可无限次渡劫。天劫仅作为世界观设定保留。

### 2.3 境界与装备的关系

- 玩家**无法装备高于自身境界 T 阶的装备**。
- 例：第 5 境（铸炉）玩家最多装备 T5 装备。

---

## 3. 物品与词缀系统

### 3.1 底材等阶

- 底材（物品基底）的等阶范围为 **T1 → T14**，与 14 境一一对应。
- T1 为最低等阶，T14 为最高等阶。

### 3.2 稀有度

| 稀有度 | 名称 | 颜色 | 词缀规则 |
| --- | --- | --- | --- |
| 普通 | 凡品 | 白 | 无词缀，仅基础属性 |
| 魔法 | 灵品 | 蓝 | 最多 1 前缀 + 1 后缀 |
| 稀有 | 宝品 | 金 | 最多 3 前缀 + 3 后缀 |
| 传奇 | 传奇 | 橙 | 固定词缀 + 特殊效果 |

- 品阶为物品固有属性，与当前词条数解耦——剥离词条不降品阶。
- 传奇仅靠掉落产出，无通货升级途径。
- **传奇物品无 T 阶**：传奇的铭文为固定效果，不参与 roll 词缀，因此不适用 T 阶体系。

### 3.3 装备槽位

| 槽位 | 名称 | 说明 |
| --- | --- | --- |
| 武器 | 法器（单手/双手） | 剑、刀、尺、拂尘、扇、葫芦、长枪、重剑、长棍、巨斧、幡、鼎 |
| 胸甲 | 内甲/法袍 | 道袍、法衣、内甲、袈裟 |
| 头盔 | 冠冕 | 道冠、束发冠、法冠、盔 |
| 手套 | 护手 | 护腕、手套、臂甲 |
| 鞋子 | 云靴 | 云履、踏云靴、战靴 |
| 盾牌 | 灵盾/护身法宝 | 灵盾、护身玉牌、八卦镜 |
| 戒指 | 灵戒 | 可戴两只 |
| 项链 | 护符 | 玉佩、项链 |
| 腰带 | 灵带 | 束带、腰带 |

### 3.4 词缀（前缀/后缀）

- 词缀分为**前缀**和**后缀**，与 PoE 一致。
- 不使用「阳铭」「阴铭」等额外术语。

**词缀 T 阶规则（核心）**：

- T 阶数字越大，相同词条的数值越高。**T14 为最高阶**，T1 为最低阶。
- **前后端约定**：后端返回完整 T 阶数据（含 T 阶数值），具体显示格式（纯数字/数字字母混合）由前端决定，后续 UI 阶段设定。

**底材与词缀 T 阶的关系**：

- 底材等阶决定了该装备可 roll 到的词缀 T 阶范围：**[底材 T 阶 - N, 底材 T 阶]**（下限最低为 T1）。
- N 为可配置参数，默认值 4。
- 也就是说，**高等级底材的池子不包含低 T 阶词缀**。

| 底材 T 阶 | 可 roll 词缀 T 阶范围 | 说明 |
| --- | --- | --- |
| T1 | T1 | 最低底材，只能出最低词缀 |
| T5 | T1~T5 | 5-4=1 |
| T8 | T4~T8 | 8-4=4 |
| T10 | T6~T10 | 10-4=6 |
| T14 | T10~T14 | 最高底材，词缀下限 T10——不可能出低 T 垃圾 |

**每种底材有独立词缀池**：

- 每种底材都有自己的**前缀池**和**后缀池**。
- 不同底材的词缀池可重叠，也可独占。
- 词缀通过全局词缀表统一定义，通过关联配置挂载到底材。

**天定词缀**（对应 PoE 破裂词缀）：

- 天定词缀在洗炼时不受影响——锁定词条永久保留。
- 由破溃宝珠分裂产生（仅限 >=4 词缀的宝品）。

**基底词缀**（对应 PoE 隐含词缀）：

- 底材自带的固定词缀，独立于前缀/后缀。
- 古灵余烬/古灵溶液可新增或替换基底词缀。

### 3.5 掉落规则

- **普通怪物只能掉落自身境界所属 T 阶及以下的底材**。
- 怪物无法掉落超过自身境界 T 阶的底材。
- 例：第 8 境（龙门）怪物最多掉落 T8 底材。
- **Boss/稀有怪可跨阶掉落**（如 +1/+2 T 阶），具体由掉落池种子文件配置，不做硬编码限制。

### 3.6 词缀效果字段

| 字段键 | 中文展示 | 示例值 |
| --- | --- | --- |
| atk | 攻击 | +8 |
| def | 防御 | +6 |
| hp | 生命 | +30 |
| spirit_power | 灵力 | +10 |
| atk_speed | 攻速 | +5 |
| hp_regen | 生命回复 | +3 |
| lingyun_gain | 灵韵获取 | +5 |
| spirit_power_pct | 灵力加成（%） | +8% |
| move_speed | 移速 | +10 |
| focus | 神识 | +6 |
| crit | 暴击（%） | +10% |
| all_stats | 全属性 | +8 |

---

## 4. 单位系统（怪物/NPC）

### 4.1 单位类型

所有对战单位分为三种阵营：

- **敌对**：可攻击玩家，击杀后按设定产出灵韵和掉落
- **中立**：不主动攻击，可能支持交互（对话/交易/任务触发）
- **友方**：协助玩家或仅作为剧情存在

### 4.2 单位属性来源

- **所有单位均以境界模板为基准**——单位的基础属性由其境界决定。
- **采用额外隐藏词条进行属性调整**——与 PoE 怪物设计一致。隐藏词条不在 UI 上展示，但影响单位的实际战斗属性。
- 隐藏词条可包括：额外伤害、额外生命、特殊技能、元素抗性等。

### 4.3 灵韵产出

- 单位分为**可获得灵韵**和**不可获得灵韵**两类。
- 击杀可获得灵韵的单位后，按单位境界产出灵韵。
- 灵韵为基础掉落资源，与物品掉落并存、互不挤占。

### 4.4 种子文件定义

- **所有单位均由种子文件定义**——data-driven，不硬编码。
- 种子文件包含：单位名称、境界、阵营、隐藏词条池、灵韵产出标记、掉落表引用。

---

## 5. 通货体系

### 5.1 双轨货币

- **灵石 = 基本交易货币（金币位）**：坊市/拍卖/NPC 交易均以灵石计价。
- **工艺通货**：承担洗炼/强化/炼丹功能，不承担交易计价。

### 5.2 工艺通货清单

| 通货 | 原型 | 效果 |
| --- | --- | --- |
| 混沌石 | Chaos Orb（含改造石功能） | 重 roll 当前品阶范围内的词条数与词缀 |
| 剥离石 | Annulment Orb | 移除 1 条随机词缀，品阶不变 |
| 重铸石 | Orb of Scouring | 清除全部词缀，还原为凡品（唯一降阶途径） |
| 点金石 | Orb of Alchemy | 凡品→宝品（roll 3~6 条词缀） |
| 蜕变石 | Orb of Transmutation | 凡品→灵品（roll 1~2 条词缀） |
| 崇高石 | Exalted Orb（含富豪石功能） | 新增 1 条词缀；灵品满 2 条再使用即升宝品 |
| 神圣石 | Divine Orb | 重 roll 词缀数值（不改词条数与种类） |
| 祝福石 | Blessed Orb | 重 roll 基础属性数值 |
| 映道镜 | Mirror of Kalandra | 复制一件物品（镜像不可再复制） |
| 瓦尔宝珠 | Vaal Orb | 危险强化：随机变异（强力词缀/入魔/摧毁，不可逆） |
| 破溃宝珠 | Fracturing Orb | 分裂 1 条随机词缀并锁定为天定词缀（需 >=4 词缀宝品） |
| 古灵余烬 | Ember of the Allflame | 新增/替换基底词缀 |
| 古灵溶液 | Wisp of the Allflame | 新增/替换基底词缀 |

### 5.3 精华

- 精华是独立的工艺物品类别，非堆叠通货，单件使用。
- 效果：定向保证词缀类别。
- 来源：怪物基础掉落。
- 分阶 1~7（低语/呢喃/啼泣/哀嚎/咆哮/尖啸/破空），3 合 1 升阶。

### 5.4 通货用途

- **炼器**（加工装备）：使用工艺通货对装备进行洗炼、强化、复制。
- **炼丹**（炼制灵药）：消耗通货与材料炼制丹药（药剂）。

---

## 6. 功法体系

### 6.1 功法槽位

- 角色固定 **9 个功法槽**：4 心法槽 + 5 术法槽。
- 心法槽结构：1 个主心法 + 3 个辅心法（光环类，无辅助孔）。
- 术法槽：5 个术法，各自独立生效（无主副、无辅助孔）。
- 只有放入功法槽的功法才处于激活状态。

### 6.2 修习与装备分离

- 所有功法皆可修习，且无法遗忘（永久收入功法册）。
- 区别仅在装备数量——最多同时装备 9 个。
- 未开光玉简（未切割宝石）：可转化为任意功法。

### 6.3 道基流派与神识预算

- 每个功法带道基标签（剑/雷/火/冰/体/阵/丹/符…）。
- 主心法定义角色道基流派：与主心法道基一致的术法获得协同加成。
- 辅心法共享神识预算：强心法占用高，形成「强度 vs 灵活」取舍。

---

## 7. 剧情与任务系统

### 7.1 主线章节

剧情最多 5 章：

| 章 | 主题 | 对应境界 | 底材 T 阶范围 |
| --- | --- | --- | --- |
| 第一章 | 初入仙途 | 1~3 境 | T1~T3 |
| 第二章 | 下山历练 | 4~6 境 | T3~T6 |
| 第三章 | 秘境夺宝 | 7~9 境 | T6~T9 |
| 第四章 | 大劫将临 | 10~12 境 | T9~T12 |
| 第五章 | 飞升前夜 | 13~14 境 | T11~T14 |

### 7.2 任务触发机制

- **与 PoE 一致——任务不需要主动接取**。
- 玩家进入区域/满足条件后自动触发。
- 特殊触发流程除外（少数关键任务可能需要主动交互）。

### 7.3 任务逻辑服

- 需要实现独立的任务逻辑服（quest service），处理任务流转。
- **所有剧情配置由种子文件定义**——data-driven，不硬编码任务流程。
- 种子文件包含：章节、触发条件、目标、奖励、对话文本。

### 7.4 终局：混沌争夺战

- 终章完成后进入混沌（无序之地）。
- 在混沌中争夺领地、遭遇混沌异兽与 Boss。
- 占领领地持续产出资源。
- 进入混沌需消耗混沌坐标。

---

## 8. 灵韵体系

### 8.1 灵韵定义

灵韵替代传统经验值体系，是核心成长资源。设定来源《黑神话·悟空》——灵韵为天地间散逸的灵气精华，击杀妖兽/魔头后可汲取。

### 8.2 灵韵规则

- **灵韵获取**：击杀标记为「可获得灵韵」的单位后产出。受词缀「灵韵获取」加成。
- **永久持有**：灵韵获取后不因死亡/失败损失。
- **灵韵用途**：
  1. **功法参悟**（技能升阶）
  2. **境界突破**
- **低级副本无递减惩罚**：可无限伐木低级副本积累灵韵，但效率低于高级副本。
- **灵韵不可交易**：角色绑定资源。

---

## 9. 放置循环

### 9.1 核心循环

进入秘境(关卡) → 自动战斗结算 → 按掉落表产出物品与灵韵
→ 辨宝法阵(拾取规则)筛选 → 符合规则→入储物袋 / 不符→自动分解或弃置
→ 离线期间按效率继续结算 → 上线整理装备、炼器强化 → 挑战更高层秘境

### 9.2 离线收益

- 公式：`min(离线小时, 12) x 每小时轮数 x 60% 效率`
- 12 小时封顶内不衰减
- 日产出上限 200 件
- 超 12h 不再累积

### 9.3 拾取规则（辨宝法阵）

- 按稀有度下限、底材 T 阶下限、目标词缀等筛选。
- 动作：保留 / 分解 / 出售。
- 系统预置默认规则（如「宝品及以上保留」）。

---

## 10. 系统解锁阶梯

| 阶段 | 引入内容 | 暂不引入 |
| --- | --- | --- |
| 第一章 | 凡品/灵品、前缀/后缀、装备与卸下、功法装槽、灵韵用途 | 洗炼、品质、天定词缀 |
| 第二章 | 宝品、蜕变石/点金石（首次洗炼教学）、功法参悟升级 | 高级通货 |
| 第三章 | 品质 0~20、混沌石、精华（定向词缀）、心法主辅重铸、道基流派成形 | 瓦尔宝珠 |
| 第四章 | 天定词缀、基底词缀替换（古灵余烬/古灵溶液）、神识预算取舍深化 | 混沌相关 |
| 第五章 | 崇高石/神圣石等全量工艺通货、渡劫机制 | — |
| 混沌终局 | 全量通货、映道镜/破溃宝珠、混沌坐标、领地争夺 | — |

---

## 11. 数据模型

### 11.0 数据库配置

- Game 数据使用**独立数据库**，连接串通过 env 文件配置。
- 环境变量：`GAME_SERVICE_DATABASE_URL`
- 使用独立 Prisma schema 文件（`game.schema.prisma`），与用户系统 schema 分离。
- 铭文存储约定：物品实例的铭文数据以 **JSON 字符串** 存入数据库（列类型为 Text/VarChar，非原生 JSON 列），应用层负责序列化与反序列化。

### 11.1 物品基底

```
model game_item_bases {
  id              Int      @id @default(autoincrement())
  code            String   @unique @db.VarChar(50)
  name            String   @db.VarChar(50)
  category        String   @db.VarChar(30)   // weapon/body/helmet/gloves/boots/shield/ring/amulet/belt
  slot            String?  @db.VarChar(20)
  sub_type        String?  @db.VarChar(30)
  tier            Int      @db.SmallInt       // 底材 T 阶 1~14
  base_stats      Json?                        // 基础属性模板
  implicit_affixes Json?                       // 基底词缀模板
  unique_affixes  Json?                        // 传奇固定词缀 code 列表
  rarity_limit    Int      @default(3)         // 可达最高稀有度
  drop_weight     Int      @default(1)
  icon            String?  @db.VarChar(100)
  created_at      DateTime @default(now()) @db.Timestamp(6)
  updated_at      DateTime @updatedAt @db.Timestamp(6)
}
```

### 11.2 词缀池

```
model game_affixes {
  id           Int      @id @default(autoincrement())
  code         String   @unique @db.VarChar(50)
  name         String   @db.VarChar(50)        // 「锋锐」「迅疾」
  polarity     String   @db.VarChar(10)        // prefix=前缀 / suffix=后缀 / base=基底
  tier         Int      @db.SmallInt           // 词缀 T 阶 1~14（数字越大越强）
  effects      Json                             // 属性效果
  weight       Int      @default(100)
  is_fractured Boolean  @default(false)         // 天定词缀标记
  created_at   DateTime @default(now()) @db.Timestamp(6)
  updated_at   DateTime @updatedAt @db.Timestamp(6)
}
```

### 11.3 底材-词缀关联（每种底材独立池）

```
model game_base_affix_pools {
  id        Int    @id @default(autoincrement())
  base_id   Int                              // → game_item_bases.id
  affix_id  Int                              // → game_affixes.id
  polarity  String @db.VarChar(10)           // prefix / suffix

  @@unique([base_id, affix_id])
  @@index([base_id])
}
```

### 11.4 物品实例

```
model game_items {
  id           BigInt   @id @default(autoincrement())
  character_id Int?
  base_id      Int
  rarity       Int      @default(0)              // 0凡/1灵/2宝/3传奇
  tier         Int      @db.SmallInt             // 底材 T 阶（冗余自 base）
  quality      Int      @default(0)              // 品质 0~20
  affixes      String?  @db.Text                   // JSON 字符串：[{affix_id, value, polarity}]，应用层序列化/反序列化
  status       String   @default("bag")           // bag/equipped/warehouse/selling
  created_at   DateTime @default(now()) @db.Timestamp(6)
  updated_at   DateTime @updatedAt @db.Timestamp(6)

  @@index([character_id, status])
}
```

### 11.5 装备栏

```
model game_equipment {
  id           Int      @id @default(autoincrement())
  character_id Int      @unique
  slots        Json                              // {"weapon": item_id, ...}
  updated_at   DateTime @updatedAt @db.Timestamp(6)
}
```

### 11.6 单位模板

```
model game_unit_templates {
  id            Int      @id @default(autoincrement())
  code          String   @unique @db.VarChar(50)
  name          String   @db.VarChar(50)
  realm         Int      @db.SmallInt            // 境界序号 1~14
  camp          String   @db.VarChar(10)         // hostile/neutral/friendly
  gives_lingyun Boolean  @default(true)          // 是否产出灵韵
  base_stats    Json                              // 境界模板基础属性
  hidden_affix_pool Json?                         // 隐藏词条池
  drop_table_ref Int?                             // 关联掉落表
  created_at    DateTime @default(now()) @db.Timestamp(6)
  updated_at    DateTime @updatedAt @db.Timestamp(6)
}
```

### 11.7 任务定义

```
model game_quest_defs {
  id            Int      @id @default(autoincrement())
  code          String   @unique @db.VarChar(50)
  chapter       Int      @db.SmallInt            // 所属章节 1~5
  name          String   @db.VarChar(100)
  trigger_type  String   @db.VarChar(20)         // auto=自动触发 / manual=特殊触发
  trigger_cond  Json?                             // 触发条件
  objectives    Json                               // 目标列表
  rewards       Json                               // 奖励列表
  dialogues     Json?                              // 对话文本
  next_quest    String?  @db.VarChar(50)          // 后续任务 code
  created_at    DateTime @default(now()) @db.Timestamp(6)
}
```

### 11.8 角色任务进度

```
model game_quest_progress {
  id            Int      @id @default(autoincrement())
  character_id  Int
  quest_code    String   @db.VarChar(50)
  status        String   @default("active")       // active/completed
  objectives    Json                               // 当前目标进度
  completed_at  DateTime? @db.Timestamp(6)

  @@unique([character_id, quest_code])
  @@index([character_id])
}
```

### 11.9 角色扩展字段

现有 characters 表需新增：

```
realm          Int      @default(1) @db.SmallInt   // 当前境界 1~14
lingyun        BigInt   @default(0)                 // 灵韵
```

并标记 silver 弃用。

---

## 12. 服务与 API

### 12.1 模块结构

```
packages/server/src/modules/game/
├── game.module.ts
├── item/
│   ├── item.module.ts
│   ├── item.controller.ts
│   ├── item.service.ts
│   └── item.affix.service.ts
├── unit/
│   ├── unit.module.ts
│   └── unit.service.ts
├── quest/
│   ├── quest.module.ts
│   ├── quest.service.ts
│   └── quest.controller.ts
└── currency/
    ├── currency.module.ts
    └── currency.service.ts
```

### 12.2 API 接口

**物品**：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/game/inventory | 背包列表 |
| GET | /api/game/inventory/:id | 物品详情 |
| POST | /api/game/item/equip | 装备物品 |
| POST | /api/game/item/unequip | 卸下物品 |
| POST | /api/game/item/discard | 丢弃/出售 |
| GET | /api/game/equipment | 当前装备栏 |
| GET | /api/game/item/bases | 物品基底库 |
| POST | /api/game/item/generate | 开发测试：生成物品 |

**任务**：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/game/quests | 当前任务列表 |
| GET | /api/game/quests/:code | 任务详情 |

**拾取规则**：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST/PUT/DELETE | /api/game/pickup-rules | 辨宝法阵 CRUD |

---

## 13. 实施阶段

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| P0（已完成） | 用户系统（注册/登录/JWT/角色） | — |
| P1 | 物品与词缀：game DB + seed（基底/词缀/底材池）+ 物品生成 + 背包/装备 API | P0 |
| P2 | 功法体系：功法册 + 9 功法槽 + 道基协同 + 神识预算 | P1 |
| P3 | 通货经济：灵石计价 + 工艺通货 + 精华 + 炼器炉/丹炉 | P1 |
| P4 | 单位系统：单位模板 seed + 隐藏词条 + 掉落关联 | P1 |
| P5 | 放置循环：掉落表 + 自动战斗结算 + 离线收益 + 辨宝法阵 | P1, P4 |
| P6 | 任务系统：任务逻辑服 + 种子文件 + 任务 API | P5 |
| P7 | 剧情章节：5 章主线内容配置 | P6 |
| P8 | 混沌终局：混沌争夺战 + 混沌坐标 + 领地争夺 | P7 |
| 暂缓 | 升华道统 / 交易拍卖 / 赛季制 | — |

---

## 14. 种子文件清单

以下为本作需要策划通过种子文件定义的数据（data-driven）：

| 种子文件 | 内容 | 关联阶段 |
| --- | --- | --- |
| item_bases.seed | 物品基底（名称/类型/槽位/T 阶/基础属性/稀有度上限） | P1 |
| affixes.seed | 词缀池（名称/前缀后缀/T 阶/效果/权重） | P1 |
| base_affix_pools.seed | 底材-词缀关联（每种底材的前缀池和后缀池） | P1 |
| unit_templates.seed | 单位模板（名称/境界/阵营/灵韵标记/基础属性/隐藏词条池） | P4 |
| drop_tables.seed | 掉落表（单位→掉落底材/稀有度/权重） | P5 |
| quest_defs.seed | 任务定义（章节/触发条件/目标/奖励/对话） | P6 |
| pickup_rules.seed | 默认拾取规则 | P5 |
