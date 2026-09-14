/**
 * 业务 DTO 类型（前端侧手工镜像，来源：`packages/server/src/modules/**`）。
 *
 * ⚠️ 唯一真相在后端源码；后端改动 DTO 时必须同步本文件。
 * 逐字段依据：`ai-docs/frontend-solution-exploration/07-后端API面清单.md`（下称 07）
 * §5 的 interface 草案 + §2 各 Action 的 data 形状；每个类型标注后端出处 `文件:行`。
 * BIGINT 列后端已统一转 number（`common/utils/safe-bigint.ts`，超 ±(2^53−1) 抛 RangeError）；
 * 日期为 `string | Date`（JSON 序列化后为 ISO string）。
 * 07 §6 标注「未确定」的字段按下述策略放宽：`baseStats` 收 `unknown`（§6-1）、
 * `craft` 扩展键全部可选（§6-6）、`finalStats` 用 `Record<string, number>`（§6-9）。
 *
 * 协议层信封类型不在此定义：见 `@nbb-ionet/client-protocol`（PROTOCOL.md §3/§4/§5）。
 */

// ===== 枚举常量（07 §4 注，镜像后端 src/**/*.types.ts）=====

/** 单位阵营（`unit.types.ts:8`）。 */
export const UNIT_CAMPS = ['hostile', 'neutral', 'friendly'] as const;
export type UnitCamp = (typeof UNIT_CAMPS)[number];

/** 掉落条目种类（`unit.types.ts:12`）。 */
export const DROP_KINDS = ['base', 'currency', 'essence'] as const;
export type DropKind = (typeof DROP_KINDS)[number];

/** 拾取规则的自动处置动作（`unit.types.ts:16`，与 PickupRuleView.action 同域）。 */
export const LOOT_ACTIONS = ['keep', 'salvage', 'sell', 'discard'] as const;
export type LootAction = (typeof LOOT_ACTIONS)[number];

/** 稀有度名称，下标即 `rarity`（`item.types.ts:6`）；越界后端返回 `'未知'`。 */
export const RARITY_NAMES = ['凡品', '灵品', '宝品', '传奇'] as const;

/** 炼器操作（14 项，`currency.types.ts:19-22`）。 */
export const CRAFT_OPS = [
  'transmute',
  'alchemy',
  'chaos',
  'exalt',
  'annul',
  'scour',
  'divine',
  'blessed',
  'mirror',
  'vaal',
  'fracture',
  'ember',
  'wisp',
  'essence',
] as const;
export type CraftOp = (typeof CRAFT_OPS)[number];

/** 十四境（`common/kernel/realm.ts:8-11`）。 */
export const REALMS = [
  '铜皮',
  '草根',
  '柳筋',
  '骨气',
  '铸炉',
  '洞府',
  '观海',
  '龙门',
  '金丹',
  '元婴',
  '玉璞',
  '仙人',
  '飞升',
  '合道',
] as const;
export type RealmName = (typeof REALMS)[number];

/** 玩家封顶境界序号（`common/kernel/realm.ts:13`）。 */
export const MAX_REALM = 14;

/** 任务状态（`quest.types.ts:75`）。 */
export const QUEST_STATUSES = ['locked', 'active', 'completed'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

/** 道基集合（8 项，`skill.types.ts:8`）。 */
export const DAOJI_SET = ['剑', '雷', '火', '冰', '体', '阵', '丹', '符'] as const;
export type Daoji = (typeof DAOJI_SET)[number];

/** 功法类型（`skill.types.ts:5`）。 */
export const SKILL_TYPES = ['xinfa', 'shufa'] as const;
export type SkillType = (typeof SKILL_TYPES)[number];

/** 面板槽位上限：辅心法 3 / 术法 5（`skill.types.ts:39`）。 */
export const PANEL_LIMITS = { aux: 3, shufa: 5 } as const;

/** 装备槽位键（10 个，`item.types.ts:9-20`）；戒指自动落 `ring1`/`ring2`。 */
export const EQUIP_SLOT_KEYS = [
  'weapon',
  'body',
  'helmet',
  'gloves',
  'boots',
  'shield',
  'ring1',
  'ring2',
  'amulet',
  'belt',
] as const;
export type EquipSlotKey = (typeof EQUIP_SLOT_KEYS)[number];

// ===== REST：auth（auth.service.ts:35-110）=====

/** 登录/注册响应里的用户摘要（`auth.service.ts:72,108`）。 */
export interface AuthUser {
  id: number;
  username: string;
}

/** POST `/api/auth/register|login` 成功 data（`auth.service.ts:67,72,108`）。 */
export interface AuthData {
  token: string;
  user: AuthUser;
}

// ===== REST：character（character.service.ts:20-45,146-160）=====

/** 角色实体（`character.service.ts:20-45,146-160`）。 */
export interface Character {
  id: number;
  userId: number;
  nickname: string;
  /** `'male' | 'female'` */
  gender: string;
  /** 创建时为 `'散修'`，可能为 null */
  title: string | null;
  /** BIGINT → number */
  spiritStones: number;
  /** （弃用）银两，BIGINT → number */
  silver: number;
  /** 当前境界序号 1~14 */
  realm: number;
  lingyun: number;
  jadeSlips: number;
}

/** `/api/character/check|create|info` 成功 data（`character.service.ts:65-75,107-114,122-130`）。 */
export interface CharacterData {
  /** 无角色时为 null（仅 check 会返回 null） */
  character: Character | null;
  hasCharacter: boolean;
}

// ===== WS：item（item.service.ts:114-180,379-459,610-622 / item.affix.service.ts:409-433）=====

/** 词缀极性（`item.affix.service.ts:409-433`）。 */
export type AffixPolarity = 'prefix' | 'suffix' | 'base';

/** 单条词缀视图 `AffixView = AffixEntry & { code,name,tier }`（`item.affix.service.ts:409-433`）。 */
export interface AffixView {
  affixId: number;
  /** 基底/固定词缀为 null */
  value: number | null;
  polarity: AffixPolarity;
  /** roll 来源效果键 */
  key: string | null;
  /** 天定铭文 */
  fractured?: boolean;
  // ===== 定义侧冗余 =====
  code: string;
  name: string;
  tier: number;
}

/** 物品视图（`item.types.ts:101-123`、`item.affix.service.ts:409-433`）。 */
export interface ItemView {
  id: number;
  baseId: number;
  baseCode: string;
  name: string;
  category: string;
  slot: string | null;
  /** 0 凡 / 1 灵 / 2 宝 / 3 传奇 */
  rarity: number;
  /** `RARITY_NAMES[rarity]`，越界为 `'未知'` */
  rarityName: string;
  tier: number;
  quality: number;
  /** `'bag' | 'equipped' | ...` */
  status: string;
  /** 已渲染中文词条 */
  affixTexts: string[];
  affixes: AffixView[];
  /** inventory/detail 恒有；generate/craft 单件渲染时不带（07 §6-7） */
  createdAt?: string | Date;
}

/** item.inventory 成功 data（`item.service.ts:114-163`，data:162）。 */
export interface InventoryData {
  total: number;
  /** 服务端已 clamp 到 `[1, MAX_PAGE]` */
  page: number;
  /** 服务端已 clamp 到 `[1,100]` */
  pageSize: number;
  items: ItemView[];
}

/** item.inventoryDetail 成功 data（`item.service.ts:166-180`）。 */
export interface InventoryDetailData {
  item: ItemView;
}

/** 物品基底图鉴项（`item.service.ts:411-422`）。 */
export interface BaseView {
  id: number;
  code: string;
  name: string;
  category: string;
  slot: string | null;
  subType: string | null;
  tier: number;
  /**
   * DB `game_item_bases.base_stats` 的 `JSON.parse` 结果（`item.service.ts:419`）。
   * ⚠️ 07 §6-1：字段级形状未确定，前端收 `unknown`，勿直接按 `Record<string, number>` 消费。
   */
  baseStats: unknown;
  rarityLimit: number;
  dropWeight: number;
  /** 仅 `withPool=1` 时出现（`item.service.ts:432-447`） */
  affixPoolSummary?: { prefix: string[]; suffix: string[] };
}

/** item.bases 成功 data（`item.service.ts:379-429`，data:428）。 */
export interface BasesData {
  total: number;
  page: number;
  pageSize: number;
  bases: BaseView[];
}

/** 拾取规则视图（`item.service.ts:610-622`）。 */
export interface PickupRuleView {
  id: number;
  characterId: number;
  name: string;
  /** 0~3 */
  rarityMin: number;
  /** 1~14 */
  tierMin: number;
  /** 最多 50 条 */
  affixCodes: string[];
  /** `'salvage' | 'sell' | 'discard' | 'keep'` */
  action: string;
  enabled: boolean;
  /** 0~1000 */
  priority: number;
}

/** item.pickupRuleList 成功 data（`item.service.ts:451-459`）。 */
export interface PickupRulesData {
  rules: PickupRuleView[];
}

/** item.pickupRuleCreate / pickupRuleUpdate 成功 data（`item.service.ts:461-514`）。 */
export interface PickupRuleData {
  rule: PickupRuleView;
}

/** item.pickupRuleDelete 成功 data（`item.service.ts:516-528`）。 */
export interface PickupRuleDeleteData {
  ruleId: number;
}

// ===== WS：item 原语（prop / equip 段，item.service.ts:85-111,183-376）=====

/** prop.discard 成功 data（`item.service.ts:317-340`）。 */
export interface PropDiscardData {
  itemId: number;
}

/** 已装备槽位摘要（`item.service.ts:343-376`）。 */
export interface EquippedSlotView {
  id: number;
  name: string;
  rarity: number;
  tier: number;
}

/** equip.equipment 成功 data（`item.service.ts:343-376`，data:375）；缺记录时全 null。 */
export interface EquipmentData {
  slots: Record<EquipSlotKey, EquippedSlotView | null>;
  equippedCount: number;
}

/** equip.equip / equip.unequip 成功 data（`item.service.ts:183-267,270-314`）。 */
export interface EquipSlotsData {
  /** 实际落位/卸下的槽位键 */
  slot: string;
  /** 槽位 → 物品 id（未占用为 null） */
  slots: Record<EquipSlotKey, number | null>;
}

// ===== WS：realm（realm.service.ts:35-78）=====

/** realm.breakthroughInfo 成功 data（`realm.service.ts:35-50`）。 */
export interface RealmStatusData {
  /** 1~14 */
  realm: number;
  /** `REALMS[realm-1]`，越界 `'未知'` */
  realmName: string;
  lingyun: number;
  /** 封顶为 null */
  nextCost: number | null;
  /** `realm >= MAX_REALM` */
  isMax: boolean;
}

/** realm.breakthrough 成功 data（`realm.service.ts:52-78`）。 */
export interface BreakthroughData {
  /** 突破后境界 */
  realm: number;
  realmName: string;
  /** 扣费后余额 */
  lingyun: number;
}

// ===== WS：economy（currency.service.ts:44-175 / craft.service.ts:71-404）=====

/** 通货视图（`currency.service.ts:44-70`）。 */
export interface CurrencyView {
  id: number;
  code: string;
  name: string;
  /** null → '' */
  description: string;
  implemented: boolean;
  /** 未持有为 0（BIGINT 已转 number） */
  owned: number;
}

/** economy.currencies 成功 data（`currency.service.ts:44-70`）。 */
export interface CurrenciesData {
  currencies: CurrencyView[];
}

/** 精华视图（`currency.service.ts:113-140`）。 */
export interface EssenceView {
  id: number;
  code: string;
  name: string;
  polarity: string;
  targetFamily: string;
  /** null → '' */
  description: string;
  owned: number;
}

/** economy.essences 成功 data（`currency.service.ts:113-140`）。 */
export interface EssencesData {
  essences: EssenceView[];
}

/** economy.currencyGrant 成功 data（`currency.service.ts:73-109`，amount=注入后总额）。 */
export interface CurrencyGrantData {
  code: string;
  amount: number;
}

/** economy.essenceGrant 成功 data（`currency.service.ts:142-175`，count=注入后存量）。 */
export interface EssenceGrantData {
  code: string;
  count: number;
}

/**
 * economy.craft **未摧毁**分支的成功 data（`craft.service.ts:383,399-403`）。
 * ⚠️ 07 §6-6：可选键随 `op` 分支出现，未知 op 扩展时无法从静态代码穷举 → 全部可选取值。
 */
export interface CraftData {
  item: ItemView;
  /** vaal：`'empowered' | 'demonic'` */
  outcome?: string;
  /** blessed：祝福后的基底数值 */
  baseStats?: Record<string, number>;
  /** wisp：新增的基底词缀 code */
  baseAffix?: string;
  /** essence：使用的精华 code */
  essence?: string;
  /** essence：精华定向的家族 */
  guaranteedFamily?: string;
  /** mirror：镜像副本物品 id */
  mirroredCopyId?: number;
}

/** economy.craft **瓦尔摧毁**分支的成功 data（`craft.service.ts:399-403`）。 */
export interface CraftDestroyedData {
  destroyed: true;
  itemId: number;
}

/** economy.craft 成功 data 联合（成功也是预期分支之一，见 `CraftData`）。 */
export type CraftResultData = CraftData | CraftDestroyedData;

// ===== WS：skill（skill.service.ts:79-361 / skill.types.ts:34-43）=====

/** 面板/图鉴里的功法摘要（`skill.service.ts:177-212`）。 */
export interface SkillBrief {
  code: string;
  name: string;
  daoji: string;
  spiritCost: number;
}

/** skill.list 图鉴项（`skill.service.ts:79-108`）。 */
export interface SkillCatalogView {
  id: number;
  code: string;
  name: string;
  /** `'xinfa' | 'shufa'` */
  skillType: string;
  daoji: string;
  school: string;
  spiritCost: number;
  /** null → '' */
  description: string;
  learned: boolean;
  /** 未修习为 null */
  level: number | null;
  /** 已渲染「{名} {值}（{L}级 效果）」 */
  effectsTexts: string[];
}

/** skill.list 成功 data（`skill.service.ts:79-108`）。 */
export interface SkillCatalogData {
  skills: SkillCatalogView[];
}

/** skill.panel 视图（`skill.service.ts:177-212`）。 */
export interface PanelView {
  xinfa: {
    /** 技能 code */
    main: string | null;
    mainInfo: SkillBrief | null;
    aux: { code: string; info: SkillBrief | null }[];
  };
  shufa: {
    code: string;
    info: SkillBrief | null;
    synergy: { code: string; matched: boolean; text: string } | null;
  }[];
  /** 仅统计 aux */
  spiritUsed: number;
  /** `APP_CONFIG.spiritBudget = 100` */
  spiritBudget: number;
  mainDaoji: string | null;
}

/** skill.panel / skill.panelUpdate 成功 data（`skill.service.ts:166-175,215-289`）。 */
export interface SkillPanelData {
  panel: PanelView;
}

/** skill.learn 成功 data（`skill.service.ts:111-162`）。 */
export interface SkillLearnData {
  skillId: number;
  jadeSlips: number;
}

/** skill.enlighten 成功 data（`skill.service.ts:292-341`）。 */
export interface EnlightenData {
  skillId: number;
  /** 参悟后等级，上限 20 */
  level: number;
  lingyun: number;
}

/** skill.lingyunGrant（dev）成功 data（`skill.service.ts:344-361`）。 */
export interface LingyunGrantData {
  lingyun: number;
}

/** skill.jadeGrant（dev）成功 data（`skill.service.ts:364-381`）。 */
export interface JadeGrantData {
  jadeSlips: number;
}

// ===== WS：combat（unit.service.ts:269-585 / unit.types.ts:76-94）=====

/** 单位图鉴项（`unit.service.ts:269-318`）。 */
export interface UnitCatalogView {
  id: number;
  code: string;
  name: string;
  realm: number;
  realmName: string;
  /** `UNIT_CAMPS` 之一 */
  camp: string;
  givesLingyun: boolean;
  dropTable: string | null;
  /** 基础四键 hp/atk/def/spiritPower + 覆盖键 */
  baseStats: Record<string, number>;
  /** 隐藏词条 code 列表 */
  hiddenPool: string[];
  lingyunReward: number;
}

/** combat.units 成功 data（`unit.service.ts:269-318`）。 */
export interface CombatUnitsData {
  total: number;
  units: UnitCatalogView[];
}

/** 掉落表条目（`unit.service.ts:320-352`）。 */
export interface DropEntryView {
  /** `DROP_KINDS` 之一 */
  kind: string;
  baseId: number | null;
  baseTier: number | null;
  rarity: number | null;
  currencyCode: string | null;
  essenceCode: string | null;
  minCount: number;
  maxCount: number;
  weight: number;
}

/** 掉落表（`unit.service.ts:320-352`）。 */
export interface DropTableView {
  id: number;
  code: string;
  name: string;
  dropsPerKill: number;
  tierOffset: number;
  entries: DropEntryView[];
}

/** combat.dropTables 成功 data（`unit.service.ts:320-352`）。 */
export interface DropTablesData {
  total: number;
  tables: DropTableView[];
}

/** 战斗单位实例（`unit.types.ts:76-94`、`unit.service.ts:172-202`）。 */
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
  /**
   * 含 `lingyunGain` 等扁平派生键。
   * ⚠️ 07 §6-9：键集合随 DB 隐藏词条动态 camelCase 展开，非固定枚举。
   */
  finalStats: Record<string, number>;
  lingyunReward: number;
}

/** combat.spawn（dev）成功 data（`unit.service.ts:356-375`）。 */
export interface UnitSpawnData {
  unit: UnitInstanceView;
}

/** combat.kill / zone.challenge.rewards 的公共结算体（`unit.service.ts:437-563`）；idle.settle 用 `Omit<…,'unit'>` 复用。 */
export interface SettlementData {
  unit: { code: string; name: string; realm: number };
  kills: number;
  lingyunGained: number;
  lingyunTotal: number;
  /** 上限 50 件 */
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

// ===== WS：zone（§22 重做；zone.service.ts / zone.types.ts）=====

/** 单秘境进度（`zone.types.ts:progressOf`）。 */
export interface ZoneProgressView {
  floor: number;
  bestFloor: number;
  cleared: boolean;
  /** §22：通关次数（重复挑战每打满一轮 +1）；`clears ≥ 1` ⇔ 已突破。 */
  clears: number;
}

/** §22：秘境类别（training 免费可挂机 / special 需道具不可挂机）。 */
export type ZoneTierKind = 'training' | 'special';

/**
 * 已突破秘境视图（`zone.service.ts:catalog` 的 `zones` 数组）—— **秘境页面**的数据源。
 *
 * §22 Q4：**未突破的秘境根本不下发**在这里；想要全量清单看 `ZoneBreakthroughView`
 * （`breakthrough` 数组，石台交互面板的数据源）。
 */
export interface ZoneView {
  id: number;
  code: string;
  name: string;
  /** 该秘境对应第几境（1~13；**不是入场闸门**） */
  realm: number;
  tierKind: ZoneTierKind;
  orderIndex: number;
  idleAllowed: boolean;
  /** special 的突破道具 code（仅展示；training 恒为 null） */
  unlockItemCode: string | null;
  unitCode: string;
  bossCode: string | null;
  basePower: number;
  powerStep: number;
  maxFloor: number;
  lingyunBonusPerFloor: number;
  /** 是否正在其中在线战斗 */
  current: boolean;
  progress: ZoneProgressView;
}

/** 突破名录条目（`zone.service.ts:catalog` 的 `breakthrough` 数组）—— 石台面板的数据源。 */
export interface ZoneBreakthroughView {
  code: string;
  name: string;
  realm: number;
  tierKind: ZoneTierKind;
  /** §22：training 恒 true；special 本轮恒 false（道具未实装） */
  canBreakthrough: boolean;
  /** `'ok' | 'item_required'`（canBreakthrough=false 的原因） */
  lockReason: 'ok' | 'item_required';
  unlockItemCode: string | null;
  /** 是否已突破（clears ≥ 1） */
  cleared: boolean;
  clears: number;
  bestFloor: number;
  maxFloor: number;
  basePower: number;
  powerStep: number;
}

/** zone.zones 成功 data（`zone.service.ts:catalog`）。 */
export interface ZonesData {
  /** 已突破秘境数（`zones.length`） */
  total: number;
  playerPower: number;
  /** 当前在线战斗所在秘境 code（无战斗为 null） */
  currentZone: string | null;
  /** 当前挂机点秘境 code（未设置 / 不再可挂机为 null） */
  idleTarget: string | null;
  /** 已突破秘境（秘境页面；§22 Q4 未解锁不显示） */
  zones: ZoneView[];
  /** 全部 13 境突破名录（第八峰·后山「秘境石台」交互用） */
  breakthrough: ZoneBreakthroughView[];
}

/** zone.progress 成功 data（`zone.service.ts:progress`；当前在线战斗的进度）。 */
export interface ZoneProgressData {
  currentZone: { code: string; name: string; realm: number };
  floor: number;
  bestFloor: number;
  clears: number;
  cleared: boolean;
  playerPower: number;
  floorRequirement: number;
  isBossFloor: boolean;
  lingyunBonus: number;
  dropTierOffset: number;
  extraDropDraws: number;
}

/** zone.enter / zone.breakthrough 成功 data（同一形状，`zone.service.ts:battleEntry`）。 */
export interface ZoneEnterData {
  currentZone: { code: string; name: string; realm: number };
  floor: number;
  bestFloor: number;
  clears: number;
}

/** zone.leave 成功 data。 */
export interface ZoneLeaveData {
  currentZone: null;
  /** 是否真的清掉了一场战斗（本来就无战斗 = false，幂等） */
  left: boolean;
}

/** zone.idleTarget 成功 data。 */
export interface ZoneIdleTargetData {
  idleTarget: { code: string; name: string; realm: number };
}

/** zone.challenge 成功 data 的奖励块（`zone.service.ts:290-383`）。 */
export interface ZoneChallengeRewards {
  lingyunGained: number;
  lingyunBonus: number;
  lingyunTotal: number;
  /** 上限 50 件 */
  items: ItemView[];
  kept: number;
  salvaged: { count: number; lingyun: number };
  sold: { count: number; spiritStones: number };
  blockedByTier: number;
  currencies: Record<string, number>;
  essences: Record<string, number>;
}

/** zone.challenge 成功 data（开发者工具；`zone.service.ts:challenge`）。 */
export interface ZoneChallengeData {
  zone: { code: string; name: string };
  floor: number;
  nextFloor: number;
  bestFloor: number;
  clears: number;
  cleared: boolean;
  playerPower: number;
  floorRequirement: number;
  isBossFloor: boolean;
  dropTierOffset: number;
  extraDropDraws: number;
  rewards: ZoneChallengeRewards;
}

// ===== 在线历练（P3.0 T5/T6；R2 §4.2 的 tick 模型；§22 修订）=====

/**
 * 在线结算事件（`online.types.ts:ZoneOnlineEvent`）。
 *
 * `stuck` 是**边沿触发**（只在刚被打回卡层时出现一次），其余事件在发生的当帧出现。
 */
export type ZoneOnlineEvent =
  | 'floor_up'
  | 'boss_floor'
  | 'boss_defeated'
  | 'realm_unlocked'
  | 'stuck';

/**
 * 不推进的原因：
 * - `ok` 正在战斗；
 * - `hidden` 会话活着但页面不可见（切后台不算在线）；
 * - `no_session` 没有活着的 WS 会话；
 * - `no_battle` 没有当前战斗（没进秘境 / 刚打满一轮自动退出）。
 */
export type ZoneOnlineReason = 'ok' | 'hidden' | 'no_session' | 'no_battle';

/**
 * `zone.online` 成功 data，也是 `zone.online` **推送帧**的 data（同一形状）。
 *
 * ⚠️ 客户端**只渲染**这一帧：**不本地涨层、不本地算产出**（R2 §4.2 明确不做）。
 * `kills` / `lingyunGained` 是「自上次推送以来」的累计；读接口恒为 0。
 * `tickMs` / `pushEveryMs` 只用于向玩家解释节奏，**不得**据此本地推进。
 */
export interface ZoneOnlineData {
  online: boolean;
  exploring: boolean;
  reason: ZoneOnlineReason;
  zone: { code: string; name: string; realm: number } | null;
  floor: number;
  maxFloor: number;
  bestFloor: number;
  cleared: boolean;
  /** §22：周目计数（`clears ≥ 1` ⇔ 已突破） */
  clears: number;
  isBossFloor: boolean;
  playerPower: number;
  floorRequirement: number;
  floorKills: number;
  killsPerFloor: number;
  stuck: boolean;
  shortfall: number;
  kills: number;
  lingyunGained: number;
  events: ZoneOnlineEvent[];
  tickMs: number;
  pushEveryMs: number;
}

/** `zone.visibility` 成功 data（P3.0 T2；只回显可见位）。 */
export interface ZoneVisibilityData {
  visible: boolean;
}

/**
 * zone 段特殊失败 data 联合（§22 修订）。
 *
 * 内联构造（不走 `fail()`）：`ZONE_ITEM_REQUIRED` / `CHALLENGE_FAILED`
 * （`zone.service.ts` 的 breakthrough / challenge）；
 * 其余失败码（`NO_ONLINE_BATTLE` / `ZONE_NOT_UNLOCKED` / `ZONE_NOT_FOUND` /
 * `ZONE_NOT_IDLE_ELIGIBLE` / `INVALID_PARAM` 等）落在最后的 `{ code: string }` 兜底成员。
 */
export type ZoneFailData =
  | { code: 'ZONE_ITEM_REQUIRED'; zone: { code: string; name: string; realm: number }; itemCode: string | null }
  | {
      code: 'CHALLENGE_FAILED';
      zone: { code: string; name: string };
      floor: number;
      playerPower: number;
      floorRequirement: number;
    }
  | { code: string };

// ===== WS：map（map.service.ts，settings-revision-2 §5.2/§5.3/§7）=====

/**
 * 单节点进度（`game_node_progress` → `map.service.ts` 的 `NodeProgressView`）。
 *
 * `visited`=跑图到达（到达即发现，§5.2）；`waypointUnlocked`=首次到达即点亮（§5.2）；
 * `idleUnlocked`=击败该秘境第一个 Boss 后解锁离线挂机（§5.5 / D2）。
 */
export interface NodeProgressView {
  visited: boolean;
  waypointUnlocked: boolean;
  idleUnlocked: boolean;
  cleared: boolean;
}

/**
 * 线路图节点视图（`game_map_nodes`）。
 *
 * ⚠️ 服务端**只下发已发现的节点**（§5.2「到达即发现」）：`requires_node_code` 为 null 的
 * 入口节点，或前置节点已 `visited` 的节点；其余节点在图上不存在（未发现 = 不显示）。
 * `featureKey` 原样下发，**服务端不判断该承载系统是否已实现**（未实现系统的可见性
 * 由客户端 registry 决定，见 §7.3）。
 */
export interface MapNodeView {
  id: number;
  code: string;
  name: string;
  /** outer / approach / peaks / inner / summit */
  ring: string;
  sector: string | null;
  /** route / secret_realm / summit */
  kind: string;
  /** skill/craft/quest/alchemy/beast/farm/pvp/discipline/waypoint/profession；null = 纯跑图 */
  featureKey: string | null;
  /**
   * 怪物境界（固定，不随层数变化）。
   *
   * ⚠️ **只有 `kind === 'secret_realm'` 的节点有值**：宗门内的山门 / 八峰 / 四院 / 主峰
   * 都是职能型枢纽（「宗门内总不能天天杀同门」），下发 `null`，前端**不得**渲染
   * 任何「怪物境界 / 难度参考门槛」文案。
   */
  level: number | null;
  /** 固定战力门槛（§6 确定性模型）；与 `level` 同口径，非秘境节点为 `null`。 */
  threshold: number | null;
  hasWaypoint: boolean;
  chapter: number;
  requiresNodeCode: string | null;
  /** kind=secret_realm 时指向 game_zones.code，否则 null */
  zoneCode: string | null;
  orderIndex: number;
  /**
   * 画布坐标：**0-based 交叉线索引**，`0..gridRows` / `0..gridCols`（P1 画布，§14.1）。
   *
   * 含义是「第 gridRow 条横线 × 第 gridCol 条竖线」的**交叉点**，不是格子中心；
   * 像素换算为 `col * CELL_PX`。服务端只做列映射，**不做任何布局计算**。
   */
  gridRow: number;
  gridCol: number;
  /** 风味文案（悬停卡 / 右栏详情）；null = 无文案 */
  description: string | null;
  /**
   * 是否与角色**当前所在**相邻（P2.0 §5：相邻可直接前往）。
   *
   * 服务端按 `game_map_edges`（拓扑权威）判定；`currentNodeCode` 为 null（新角色 /
   * 位置漂移到已删节点）时全部为 `false`。前端只消费，**不做本地邻接推断**。
   */
  adjacent: boolean;
  progress: NodeProgressView;
}

/**
 * 地图对象（`game_map_objects`，P2.0 §3）：一院多职能的**明细**。
 *
 * 节点上的 `featureKey` 是该院的「主职能」摘要，本对象是具体职能入口
 * （如百工院挂「丹霞院 / 百器阁」两项）。本轮只做**显示 + 入口**：
 * 点击对象仍走客户端 `FeatureGate`（未实现系统 → 「未开放」），没有 `map.interact`。
 */
export interface MapObjectView {
  id: number;
  code: string;
  /** 宿主枢纽（四院或主峰）；前端按此过滤出当前节点的对象列表 */
  nodeCode: string;
  /** `'office'` = 职能入口（本轮唯一类型） */
  kind: string;
  name: string;
  /** 要打开的系统；本轮 11 个对象全部非空 */
  featureKey: string | null;
  description: string | null;
  orderIndex: number;
}

/**
 * 线路图边（`game_map_edges`）。
 *
 * ⚠️ 服务端只下发**两端节点都已发现**的边；未发现节点不出现在图上，也不泄露其邻接关系。
 */
export interface MapEdgeView {
  fromNodeCode: string;
  toNodeCode: string;
  bidirectional: boolean;
}

/** 单张地图（`game_maps` + 该角色可见的节点/边）。 */
export interface MapView {
  id: number;
  code: string;
  name: string;
  /** 世界标识（本世界青云宗 = `world_qingyun`；异界/混沌海预留，§5.6） */
  world: string;
  orderIndex: number;
  chapterFrom: number;
  chapterTo: number;
  requiresMapCode: string | null;
  description: string | null;
  /** 坐标空间行数：交叉线索引 `0..gridRows`（P1 画布） */
  gridRows: number;
  /** 坐标空间列数：交叉线索引 `0..gridCols` */
  gridCols: number;
  /**
   * 底图资源 key（前端注册表解析成资源路径，与 `feature-registry` 同一做法）。
   * 本轮恒为 null = 不画底图；数据库里存 key 而不是 URL，换 CDN/文件名时不必改库。
   */
  backgroundKey: string | null;
  /**
   * 角色**当前所在**的本图节点 code（P2.0 §5，服务端持久化在 `game_map_state`）。
   * null = 新角色（四门任进）或位置指向已删节点 / 别的地图。
   */
  currentNodeCode: string | null;
  nodes: MapNodeView[];
  edges: MapEdgeView[];
  /** 本图全部职能对象（全量下发；前端按宿主 `nodeCode` 过滤后列入右栏） */
  objects: MapObjectView[];
}

/** map.list 成功 data（`map.service.ts` 的 `panel`）。 */
export interface MapPanelData {
  total: number;
  playerPower: number;
  maps: MapView[];
}

/** map.enter 成功 data（`map.service.ts` 的 `enter`）。 */
export interface MapEnterData {
  node: MapNodeView;
  playerPower: number;
  /** 该节点的展示门槛；非秘境节点为 `null`（与 `MapNodeView.threshold` 同值） */
  threshold: number | null;
  /** 本次是否为首次到达（重复 enter 同一节点幂等，第二次为 false） */
  firstVisit: boolean;
}

/** map.waypoint 成功 data（`map.service.ts` 的 `waypoint`）。 */
export interface MapWaypointData {
  node: MapNodeView;
}

/** map.enter / map.waypoint 请求体。 */
export interface MapNodeInput {
  nodeCode: string;
}

/**
 * map 段失败 data 联合（`map.service.ts` 内联构造，非 `fail()` 单键）。
 *
 * - `NODE_NOT_FOUND`：nodeCode 无对应节点；
 * - `NODE_LOCKED`：**历史码**（P2.0 起 `requires_node_code` 不再作为进入闸门，服务端已不再返回，
 *   保留此成员以免下游穷举 `code` 时编译失败）；
 * - `NODE_NOT_ADJACENT`：与当前所在地不相邻且非山门（P2.0 §5 的防回归核心）；
 * - `NODE_POWER_NOT_ENOUGH`：相邻但仍 `playerPower < threshold`（恰好等于门槛应通过）；
 * - `NODE_NOT_VISITED`：传送时该节点从未到达过；
 * - `WAYPOINT_NOT_UNLOCKED`：到达过但传送点未点亮 / 该节点没有传送点。
 * 其余（含 `INVALID_PARAM` / `CHARACTER_NOT_FOUND` / `ZONE_NOT_IDLE_UNLOCKED`）落最后兜底成员。
 */
export type MapFailData =
  | { code: 'NODE_NOT_FOUND'; nodeCode: string }
  | { code: 'NODE_LOCKED'; nodeCode: string; requiresNodeCode: string | null }
  | { code: 'NODE_NOT_ADJACENT'; nodeCode: string }
  | { code: 'NODE_POWER_NOT_ENOUGH'; nodeCode: string; playerPower: number; threshold: number }
  | { code: 'NODE_NOT_VISITED'; nodeCode: string }
  | { code: 'WAYPOINT_NOT_UNLOCKED'; nodeCode: string; hasWaypoint: boolean }
  | { code: string };

// ===== WS：quest（quest.service.ts:132-331 / quest.types.ts:30-57）=====

/** 任务触发条件（`quest.types.ts:30-33`）。⚠️ 07 §6-2：值来自 DB JSON，可能含其它键。 */
export interface QuestTrigger {
  realm?: number;
  requires?: string[];
}

/** 任务奖励包（`quest.types.ts:42-48`）。⚠️ 07 §6-3：额外键会被 `applyBundle` 静默忽略。 */
export interface QuestRewards {
  lingyun?: number;
  spiritStones?: number;
  jadeSlips?: number;
  currencies?: Record<string, number>;
  essences?: Record<string, number>;
}

/** 任务目标进度（`quest.service.ts:132-182`）。 */
export interface ObjectiveProgress {
  /**
   * `reach_realm | zone_best_floor | zone_cleared | own_items | learn_skills | lingyun
   * | kill_total | kill_unit | breakthrough_total | craft_total | 未知(恒 false)`
   */
  type: string;
  key?: string;
  value?: number;
  current: number;
  done: boolean;
  /** 缺省 '' */
  desc: string;
}

/** 任务列表项（`quest.service.ts:132-182`）。 */
export interface QuestView {
  code: string;
  chapter: number;
  name: string;
  orderIndex: number;
  status: QuestStatus;
  /** `status === 'active' && objectives 非空 && 全 done` */
  claimable: boolean;
  objectives: ObjectiveProgress[];
}

/** quest.list 成功 data（`quest.service.ts:154-182`）。 */
export interface QuestListData {
  total: number;
  completed: number;
  quests: QuestView[];
}

/** 任务详情（`quest.service.ts:184-218`）。 */
export interface QuestDetail extends QuestView {
  /** DB JSON，形状见 07 §6-2 */
  trigger: QuestTrigger;
  /** DB JSON，形状见 07 §6-3 */
  rewards: QuestRewards;
  /** DB JSON，键为 `'start'`/`'done'`（07 §6-4） */
  dialogues: Record<string, string> | null;
  nextQuest: string | null;
  completedAt: string | Date | null;
}

/** quest.detail 成功 data（`quest.service.ts:184-218`）。 */
export interface QuestDetailData {
  quest: QuestDetail;
}

/** quest.sync / quest.chapterSync 的同步条目（`quest.service.ts:324-329`）。 */
export interface QuestSyncEntry {
  code: string;
  name: string;
  rewards: QuestRewards;
}

/** 任务/章节同步的累计收益（`quest.service.ts:324-329`、`chapter.service.ts:250-255`）。 */
export interface QuestSyncTotals {
  lingyun: number;
  spiritStones: number;
  jadeSlips: number;
  currencies: Record<string, number>;
  essences: Record<string, number>;
}

/** quest.sync 成功 data（`quest.service.ts:249-331`，data:324-329）。 */
export interface QuestSyncData {
  completedCount: number;
  completed: QuestSyncEntry[];
  granted: QuestSyncEntry[];
  totals: QuestSyncTotals;
}

/** 章节列表项（`chapter.service.ts:78-126`）。 */
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

/** quest.chapterList 成功 data（`chapter.service.ts:78-126`）。 */
export interface ChapterListData {
  total: number;
  currentChapter: number | null;
  chapters: ChapterView[];
}

/** 章节详情（`chapter.service.ts:128-183`）。 */
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
  /** DB JSON（07 §6-3） */
  rewards: QuestRewards;
  /** DB JSON，键 `'intro'`/`'outro'`（07 §6-4） */
  dialogues: Record<string, string> | null;
  /** status ∈ locked|active|completed */
  quests: { code: string; name: string; status: string }[];
}

/** quest.chapterDetail 成功 data（`chapter.service.ts:128-183`）。 */
export interface ChapterDetailData {
  chapter: ChapterDetail;
}

/** quest.chapterSync 成功 data（`chapter.service.ts:185-257`，data:250-255）。 */
export interface ChapterSyncData {
  completedCount: number;
  completed: QuestSyncEntry[];
  granted: QuestSyncEntry[];
  totals: QuestSyncTotals;
}

// ===== WS：story（story.service.ts:13-20,84-140）=====

/** 剧情节点（`story.service.ts:13-20,75-106`）。节点集合由 DB dialogues 驱动。 */
export interface StoryNode {
  /** `chapter:<code>:intro|outro` | `quest:<code>:start|done` */
  nodeKey: string;
  /** `'chapter_intro' | 'chapter_outro' | 'quest_start' | 'quest_done'` */
  type: string;
  /** 来自 DB dialogues */
  text: string;
  seen: boolean;
  /** 仅 quest_* 节点 */
  questCode?: string;
  /** 仅 quest_* 节点 */
  questStatus?: string;
}

/** story.chapter 成功 data（`story.service.ts:84-112`）。 */
export interface StoryChapterData {
  chapter: { code: string; name: string; chapter: number };
  nodes: StoryNode[];
}

/** story.quest 成功 data（`story.service.ts:114-128`）。 */
export interface StoryQuestData {
  quest: { code: string; name: string; status: string };
  nodes: StoryNode[];
}

/** story.seen 成功 data（`story.service.ts:130-140`）。 */
export interface StorySeenData {
  nodeKey: string;
  seen: true;
}

// ===== WS：idle（idle.service.ts:77-201）=====

/** 挂机参数（`idle.service.ts:85-107`）。 */
export interface IdleConfigView {
  /** 60 */
  roundsPerHour: number;
  /** 60 */
  efficiencyPct: number;
  /** 12 */
  maxOfflineHours: number;
}

/** idle.status 成功 data（`idle.service.ts:85-107`）。 */
export interface IdleStatusData {
  realm: number;
  /** ISO（服务端 `toISOString`） */
  lastSettleAt: string;
  /** `max(0, 真实离线小时)` */
  pendingHours: number;
  /** `round(offlineHours × efficiency) / 100` */
  effectiveHours: number;
  /** `floor(offlineHours × rounds × efficiency / 100)` */
  estimatedKills: number;
  estimatedLingyun: number;
  dailyItemsProduced: number;
  /** 200 */
  dailyItemCap: number;
  config: IdleConfigView;
}

/**
 * idle.settle 正常结算分支（`idle.service.ts:settle`）：
 * `SettlementData` 去掉单层语义的 `unit`，换成整轮挂机的 `zone` + `floors`。
 */
export type IdleSettleData = Omit<SettlementData, 'unit'> & {
  /** §23 A3：本轮的结算秘境（`maxFloor` = 一整轮的层数）；显式 `unitCode` 的调试结算为 null */
  zone: IdleSettleZoneView | null;
  /** §23 A3：逐层战果（升序）；显式 `unitCode` 的调试结算为空数组 */
  floors: IdleFloorView[];
  offlineHours: number;
  effectiveHours: number;
  dailyItemsProduced: number;
  dailyItemCap: number;
};

/**
 * §23 A3：整轮挂机的**单层战果**（`idle.service.ts:settleWholeRound`）。
 *
 * A3 起挂机不再有"单一单位"（一轮会依次打第 1..maxFloor 层，Boss 层另有单位），
 * 因此结算展示必须按层遍历本数组，不能用 `unit.name` 概括。
 */
export interface IdleFloorView {
  floor: number;
  unitCode: string;
  /** 该层单位中文名（面板展示用；`unitCode` 不上屏） */
  unitName: string;
  isBoss: boolean;
  /** 该层分摊到的击杀数（恒 > 0；0 杀的层不会出现在数组里） */
  kills: number;
}

/** §23 A3：结算秘境（`idle.service.ts:settleWholeRound` 的 zone 回填）。 */
export interface IdleSettleZoneView {
  code: string;
  name: string;
  /** 一整轮的层数（1..maxFloor） */
  maxFloor: number;
}

/**
 * idle.settle 「无可结算」分支（kills≤0 且未传 `hours`，`idle.service.ts:emptySettleData`）。
 * 逐字段按后端实际下发形状收窄（常量字段用字面量类型）。
 */
export interface IdleSettleEmptyData {
  zone: null;
  floors: [];
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

/**
 * idle.settle 成功 data：正常分支 | 空结算分支（`idle.service.ts:settle`）。
 *
 * 判别式是 **`kills === 0`**（A3 起不再用 `unit === null` —— 整轮挂机本来就没有单一单位）。
 */
export type IdleSettleResultData = IdleSettleData | IdleSettleEmptyData;

// ===== WS：system（health.action.ts:14-21）=====

/**
 * system.ping 成功 data。
 *
 * ⚠️ 07 §2.1/§6-8：`system.ping` **不守 `{success,message}` 约定**，信封 `data` 即本裸对象，
 * 因此 `SystemApi.ping` 必须走 `requestEnvelope` 而不能走 `request` 的 `ActionResult` 泛型。
 */
export interface SystemPingData {
  status: 'ok';
  service: string;
  /** 毫秒时间戳 */
  timestamp: number;
}
