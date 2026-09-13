/**
 * 游戏 Action API 层（13 个逻辑服段，共 49 个 Action）—— 07 §2 的逐 Action 收口。
 *
 * 设计约束：
 * - 路由 `(cmd, subCmd)` **只引用 `commands.ts` 常量**，禁止字面量数字（唯一真相在后端 `cmd.ts`）。
 * - 请求/成功 data 形状来自 `dto.ts`（逐字段镜像 07 §5），方法签名对请求字段做类型化。
 * - 除 `SystemApi.ping` 外，其余方法统一返回 `ActionResult<TData>`；
 *   `request` 默认在 `data.success === false` 时抛 `BusinessError`（06 §2 判定顺序）。
 * - 「业务失败是预期分支」的 Action 传 `{ allowBusinessFailure: true }`，把失败体原样返回，
 *   由调用方按 `ZoneFailData` 等联合类型分流（07 §5.9）。
 */
import type { ResponseMessage } from '@nbb-ionet/client-protocol';
import type { ActionResult } from '../client/errors.js';
import type { SendOptions } from '../client/ionet-client.js';
import {
  COMBAT_CMD,
  ECONOMY_CMD,
  EQUIP_CMD,
  IDLE_CMD,
  ITEM_CMD,
  MAP_CMD,
  PROP_CMD,
  QUEST_CMD,
  REALM_CMD,
  SKILL_CMD,
  STORY_CMD,
  SYSTEM_CMD,
  ZONE_CMD,
} from './commands.js';
import type {
  BasesData,
  BreakthroughData,
  ChapterDetailData,
  ChapterListData,
  ChapterSyncData,
  CombatUnitsData,
  CraftResultData,
  CurrenciesData,
  CurrencyGrantData,
  DropTablesData,
  EnlightenData,
  EquipmentData,
  EquipSlotsData,
  EssenceGrantData,
  EssencesData,
  IdleSettleResultData,
  IdleStatusData,
  InventoryData,
  InventoryDetailData,
  JadeGrantData,
  LingyunGrantData,
  MapEnterData,
  MapPanelData,
  MapWaypointData,
  PickupRuleData,
  PickupRuleDeleteData,
  PickupRulesData,
  PropDiscardData,
  QuestDetailData,
  QuestListData,
  QuestSyncData,
  RealmStatusData,
  SettlementData,
  SkillCatalogData,
  SkillLearnData,
  SkillPanelData,
  StoryChapterData,
  StoryQuestData,
  StorySeenData,
  SystemPingData,
  UnitSpawnData,
  ZoneChallengeData,
  ZoneEnterData,
  ZoneOnlineData,
  ZoneProgressData,
  ZoneVisibilityData,
  ZonesData,
} from './dto.js';

// ===== 传输接口 =====

/**
 * `GameApi` 依赖的最小传输面（由 `IonetClient` 结构性满足，也可注入测试桩）。
 *
 * `request`：成功时返回 Action 业务体 `{ success, message, data }`；
 * `requestEnvelope`：返回**原始响应信封**，供 `system.ping` 这类不守 Action 约定的 Action 使用。
 */
export interface GameApiTransport {
  request<TData = unknown>(
    cmd: number,
    subCmd: number,
    data?: unknown,
    options?: SendOptions,
  ): Promise<ActionResult<TData>>;
  requestEnvelope(
    cmd: number,
    subCmd: number,
    data?: unknown,
    options?: SendOptions,
  ): Promise<ResponseMessage>;
}

/** 强制 `allowBusinessFailure: true`：业务失败是预期分支，不得被 `request` 抛成异常。 */
function expectedBusinessFailure(options?: SendOptions): SendOptions {
  return { ...options, allowBusinessFailure: true };
}

// ===== 请求参数类型（07 §2 各 Action 的「请求 data」列）=====

/** item.inventory 请求参数（`item.action.ts:25-38`）；分页由服务端再 clamp。 */
export interface InventoryQuery {
  category?: string;
  /** 稀有度 0~3 */
  rarity?: number;
  tierMin?: number;
  tierMax?: number;
  /** @default 1 */
  page?: number;
  /** @default 20（上限 100） */
  pageSize?: number;
}

/** item.bases 请求参数（`item.action.ts:49-62`）。 */
export interface BasesQuery {
  category?: string;
  tier?: number;
  /** @default 1 */
  page?: number;
  /** @default 20（上限 100） */
  pageSize?: number;
  /** 传 `1`/`'1'` 才回填 `affixPoolSummary`，其余值视为 0 */
  withPool?: 1 | '1';
}

/**
 * item.pickupRuleCreate 请求参数（`item.action.ts:71-85`）。
 * 除 `name` 外服务端按 `item.service.ts:633-647` 规范化：
 * `rarityMin` clamp[0,3]、`tierMin` clamp[1,14]、`affixCodes` 仅保留 string 且最多 50 条、
 * `action` ∈ `LOOT_ACTIONS` 否则 `'keep'`、`enabled` 仅 `false` 为 false、`priority` clamp[0,1000]。
 */
export interface PickupRuleCreateInput {
  /** 必填非空 */
  name: string;
  rarityMin?: number;
  tierMin?: number;
  affixCodes?: string[];
  action?: string;
  enabled?: boolean;
  priority?: number;
}

/**
 * item.pickupRuleUpdate 请求参数（`item.action.ts:87-103`）。
 * `id` / `ruleId` 至少给一个；其余字段为**部分更新**（undefined 保持原值）。
 */
export interface PickupRuleUpdateInput {
  id?: number;
  ruleId?: number;
  name?: string;
  rarityMin?: number;
  tierMin?: number;
  affixCodes?: string[];
  action?: string;
  enabled?: boolean;
  priority?: number;
}

/** item.pickupRuleDelete 请求参数（`item.action.ts:105-112`）；`id` / `ruleId` 至少给一个。 */
export interface PickupRuleIdInput {
  id?: number;
  ruleId?: number;
}

/** prop.generate（dev）请求参数（`prop.action.ts:29-41`）。 */
export interface GenerateItemInput {
  baseId: number;
  rarity: number;
  /** 缺省为当前角色；传 null 亦按缺省处理 */
  characterId?: number | null;
}

/** skill.panelUpdate 载荷（`skill.action.ts:48-53`）；数组元素必须为非空 string。 */
export interface SkillPanelUpdateInput {
  xinfa?: { main?: string | null; aux?: string[] };
  shufa?: string[];
}

/** economy.currencyGrant（dev）请求参数（`economy.action.ts:30-39`）；count ∈ [1,9999]。 */
export interface CurrencyGrantInput {
  code: string;
  count: number;
}

/** economy.essenceGrant（dev）请求参数（`economy.action.ts:65-74`）；count ∈ [1,99]。 */
export interface EssenceGrantInput {
  code: string;
  count: number;
}

/**
 * economy.craft 请求参数（`economy.action.ts:41-56`）。
 * `essenceCode` / `targetCode` 二者取先非空者作为后端 `extraCode`。
 */
export interface CraftInput {
  itemId: number;
  /** ∈ `CRAFT_OPS` */
  op: string;
  essenceCode?: string;
  targetCode?: string;
}

/** combat.units 请求参数（`combat.action.ts:23-37`）。 */
export interface UnitsQuery {
  /** 1~14 */
  realm?: number;
  /** ∈ `UNIT_CAMPS` */
  camp?: string;
}

/** combat.spawn（dev）请求参数（`combat.action.ts:46-55`）；hiddenCount ∈ [0,6]。 */
export interface SpawnUnitInput {
  code: string;
  hiddenCount?: number;
}

/** combat.kill（dev）请求参数（`combat.action.ts:57-66`）；count ∈ [1,50]。 */
export interface KillUnitInput {
  code: string;
  /** @default 1（上限 `maxKillsPerRequest` = 50） */
  count?: number;
}

/** idle.settle 请求参数（`idle.action.ts:36-58`）。 */
export interface IdleSettleInput {
  /** 非空才生效 */
  unitCode?: string;
  /** 0~10000，仅非生产环境可用 */
  hours?: number;
}

// ===== system 段（cmd 1）=====

/** system 段（`health.action.ts:14-21`；07 §2.1）。 */
export class SystemApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 应用层心跳 / 存活探针（`system.ping`，免鉴权白名单）。
   *
   * ⚠️ 返回值是**裸对象** `{status,service,timestamp}`，没有 `success/message` 包装（07 §2.1/§6-8），
   * 因此这里必须走 `requestEnvelope` 再取 `envelope.data`，不能走 `request` 的 `ActionResult` 泛型。
   * 传输层失败仍由 `requestEnvelope` 抛 `TransportError`；本 Action 无业务失败码。
   *
   * 出处：`health.action.ts:14-21`、`cmd.ts:168-170`。
   */
  async ping(options?: SendOptions): Promise<SystemPingData> {
    const envelope = await this.transport.requestEnvelope(
      SYSTEM_CMD.cmd,
      SYSTEM_CMD.ping,
      undefined,
      options,
    );
    return envelope.data as SystemPingData;
  }
}

// ===== item 段（cmd 30）=====

/** item 段：背包 / 图鉴 / 拾取规则（07 §2.2）。 */
export class ItemApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 背包分页查询。
   * 失败码：`CHARACTER_NOT_FOUND`。
   * 出处：`item.action.ts:25-38`、`item.service.ts:114-163`。
   */
  inventory(
    params: InventoryQuery = {},
    options?: SendOptions,
  ): Promise<ActionResult<InventoryData>> {
    const { page = 1, pageSize = 20, ...rest } = params;
    return this.transport.request<InventoryData>(
      ITEM_CMD.cmd,
      ITEM_CMD.inventory,
      { ...rest, page, pageSize },
      options,
    );
  }

  /**
   * 背包物品详情。
   * 失败码：`INVALID_PARAM`（id 非法）、`ITEM_NOT_FOUND`、`ITEM_NOT_OWNED`。
   * 出处：`item.action.ts:40-47`、`item.service.ts:166-180`。
   */
  inventoryDetail(id: number, options?: SendOptions): Promise<ActionResult<InventoryDetailData>> {
    return this.transport.request<InventoryDetailData>(
      ITEM_CMD.cmd,
      ITEM_CMD.inventoryDetail,
      { id },
      options,
    );
  }

  /**
   * 物品基底图鉴（公开数据，无业务码）。
   * `withPool` 只在传 `1` / `'1'` 时回填 `affixPoolSummary`。
   * 出处：`item.action.ts:49-62`、`item.service.ts:379-429`。
   */
  bases(params: BasesQuery = {}, options?: SendOptions): Promise<ActionResult<BasesData>> {
    const { page = 1, pageSize = 20, ...rest } = params;
    return this.transport.request<BasesData>(
      ITEM_CMD.cmd,
      ITEM_CMD.bases,
      { ...rest, page, pageSize },
      options,
    );
  }

  /**
   * 拾取规则列表（辨宝法阵）。无业务码。
   * 出处：`item.action.ts:64-69`、`item.service.ts:451-459`。
   */
  pickupRuleList(options?: SendOptions): Promise<ActionResult<PickupRulesData>> {
    return this.transport.request<PickupRulesData>(ITEM_CMD.cmd, ITEM_CMD.pickupRuleList, {}, options);
  }

  /**
   * 新建拾取规则。
   * 失败码：`INVALID_RULE`、`CHARACTER_NOT_FOUND`。
   * 出处：`item.action.ts:71-85`、`item.service.ts:461-478`。
   */
  pickupRuleCreate(
    input: PickupRuleCreateInput,
    options?: SendOptions,
  ): Promise<ActionResult<PickupRuleData>> {
    return this.transport.request<PickupRuleData>(
      ITEM_CMD.cmd,
      ITEM_CMD.pickupRuleCreate,
      input,
      options,
    );
  }

  /**
   * 部分更新拾取规则（undefined 字段保持原值）。
   * 失败码：`INVALID_PARAM`（id 非法）、`PICKUP_RULE_NOT_FOUND`。
   * 出处：`item.action.ts:87-103`、`item.service.ts:480-514`。
   */
  pickupRuleUpdate(
    input: PickupRuleUpdateInput,
    options?: SendOptions,
  ): Promise<ActionResult<PickupRuleData>> {
    return this.transport.request<PickupRuleData>(
      ITEM_CMD.cmd,
      ITEM_CMD.pickupRuleUpdate,
      input,
      options,
    );
  }

  /**
   * 删除拾取规则。
   * 失败码：`INVALID_PARAM`、`PICKUP_RULE_NOT_FOUND`。
   * 出处：`item.action.ts:105-112`、`item.service.ts:516-528`。
   */
  pickupRuleDelete(
    input: PickupRuleIdInput,
    options?: SendOptions,
  ): Promise<ActionResult<PickupRuleDeleteData>> {
    return this.transport.request<PickupRuleDeleteData>(
      ITEM_CMD.cmd,
      ITEM_CMD.pickupRuleDelete,
      input,
      options,
    );
  }
}

// ===== prop 段（cmd 40）=====

/** prop 段：item 原语的薄封装（07 §2.3）。 */
export class PropApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 丢弃背包内物品。
   * 失败码：`INVALID_PARAM`、`ITEM_NOT_FOUND`、`ITEM_NOT_OWNED`、`ITEM_NOT_IN_BAG`。
   * 出处：`prop.action.ts:20-27`、`item.service.ts:317-340`。
   */
  discard(itemId: number, options?: SendOptions): Promise<ActionResult<PropDiscardData>> {
    return this.transport.request<PropDiscardData>(PROP_CMD.cmd, PROP_CMD.discard, { itemId }, options);
  }

  /**
   * 生成物品（dev 接口，生产禁用）。
   *
   * 业务失败是**预期分支**（`{ allowBusinessFailure: true }`，失败体原样返回）：
   * `INVALID_PARAM`、`FORBIDDEN`（生产禁用/越权）、`RATE_LIMITED`、`BASE_NOT_FOUND`、
   * `RARITY_EXCEEDS_LIMIT`、`CHARACTER_NOT_FOUND`。
   *
   * 成功 data 形状与 `inventoryDetail` 相同（`{ item: ItemView }`）。
   * 出处：`prop.action.ts:29-41`、`item.service.ts:85-111`、`item.affix.service.ts:135-204`。
   */
  generate(
    input: GenerateItemInput,
    options?: SendOptions,
  ): Promise<ActionResult<InventoryDetailData>> {
    return this.transport.request<InventoryDetailData>(
      PROP_CMD.cmd,
      PROP_CMD.generate,
      input,
      expectedBusinessFailure(options),
    );
  }
}

// ===== equip 段（cmd 50）=====

/** equip 段：装备/卸下/装备栏（07 §2.4）。 */
export class EquipApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 装备背包内物品（戒指自动落 `ring1`/`ring2`）。
   * 失败码：`INVALID_PARAM`、`ITEM_NOT_FOUND`、`ITEM_NOT_OWNED`、`ITEM_NOT_IN_BAG`、
   * `TIER_TOO_HIGH`、`SLOT_OCCUPIED`。
   * 出处：`equip.action.ts:21-28`、`item.service.ts:183-267`。
   */
  equip(itemId: number, options?: SendOptions): Promise<ActionResult<EquipSlotsData>> {
    return this.transport.request<EquipSlotsData>(EQUIP_CMD.cmd, EQUIP_CMD.equip, { itemId }, options);
  }

  /**
   * 卸下已装备物品。
   * 失败码：`INVALID_PARAM`、`ITEM_NOT_FOUND`、`ITEM_NOT_OWNED`、`ITEM_NOT_EQUIPPED`。
   * 出处：`equip.action.ts:30-37`、`item.service.ts:270-314`。
   */
  unequip(itemId: number, options?: SendOptions): Promise<ActionResult<EquipSlotsData>> {
    return this.transport.request<EquipSlotsData>(
      EQUIP_CMD.cmd,
      EQUIP_CMD.unequip,
      { itemId },
      options,
    );
  }

  /**
   * 装备栏全量视图（无业务码，无装备记录时 `slots` 全 null）。
   * 出处：`equip.action.ts:39-44`、`item.service.ts:343-376`。
   */
  equipment(options?: SendOptions): Promise<ActionResult<EquipmentData>> {
    return this.transport.request<EquipmentData>(EQUIP_CMD.cmd, EQUIP_CMD.equipment, {}, options);
  }
}

// ===== skill 段（cmd 60）=====

/** skill 段：功法图鉴 / 面板 / 参悟（07 §2.5）。 */
export class SkillApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 功法图鉴（含未修习项）。无业务码。
   * 出处：`skill.action.ts:25-30`、`skill.service.ts:79-108`。
   */
  list(options?: SendOptions): Promise<ActionResult<SkillCatalogData>> {
    return this.transport.request<SkillCatalogData>(SKILL_CMD.cmd, SKILL_CMD.list, {}, options);
  }

  /**
   * 修习功法（消耗未开光玉简）。
   * 失败码：`INVALID_PARAM`、`SKILL_NOT_FOUND`、`ALREADY_LEARNED`、`JADE_NOT_ENOUGH`。
   * 出处：`skill.action.ts:32-39`、`skill.service.ts:111-162`。
   */
  learn(skillId: number, options?: SendOptions): Promise<ActionResult<SkillLearnData>> {
    return this.transport.request<SkillLearnData>(SKILL_CMD.cmd, SKILL_CMD.learn, { skillId }, options);
  }

  /**
   * 功法面板视图。无业务码。
   * 出处：`skill.action.ts:41-46`、`skill.service.ts:166-212`。
   */
  panel(options?: SendOptions): Promise<ActionResult<SkillPanelData>> {
    return this.transport.request<SkillPanelData>(SKILL_CMD.cmd, SKILL_CMD.panel, {}, options);
  }

  /**
   * 覆盖式更新功法面板（整个 `data` 即载荷，服务端写后回读视图）。
   * 失败码：`SLOTS_INVALID`、`DUPLICATE_SLOT`、`SLOT_COUNT_EXCEEDED`（`PANEL_LIMITS`）、
   * `SKILL_NOT_FOUND`、`NOT_LEARNED`、`SPIRIT_BUDGET_EXCEEDED`。
   * 出处：`skill.action.ts:48-53`、`skill.service.ts:215-289`。
   */
  panelUpdate(
    payload: SkillPanelUpdateInput = {},
    options?: SendOptions,
  ): Promise<ActionResult<SkillPanelData>> {
    return this.transport.request<SkillPanelData>(
      SKILL_CMD.cmd,
      SKILL_CMD.panelUpdate,
      payload,
      options,
    );
  }

  /**
   * 参悟提升功法等级（消耗灵韵）。
   * 失败码：`INVALID_PARAM`、`SKILL_NOT_FOUND`、`NOT_LEARNED`、`MAX_LEVEL_REACHED`、
   * `LINGYUN_NOT_ENOUGH`。
   * 出处：`skill.action.ts:55-62`、`skill.service.ts:292-341`。
   */
  enlighten(skillId: number, options?: SendOptions): Promise<ActionResult<EnlightenData>> {
    return this.transport.request<EnlightenData>(
      SKILL_CMD.cmd,
      SKILL_CMD.enlighten,
      { skillId },
      options,
    );
  }

  /**
   * 注入灵韵（dev 接口）。
   * 失败码：`INVALID_PARAM`（需 1~1000000）、`FORBIDDEN`、`RATE_LIMITED`。
   * 出处：`skill.action.ts:64-71`、`skill.service.ts:344-361`。
   */
  lingyunGrant(amount: number, options?: SendOptions): Promise<ActionResult<LingyunGrantData>> {
    return this.transport.request<LingyunGrantData>(
      SKILL_CMD.cmd,
      SKILL_CMD.lingyunGrant,
      { amount },
      options,
    );
  }

  /**
   * 注入未开光玉简（dev 接口）。
   * 失败码：`INVALID_PARAM`（需 1~100）、`FORBIDDEN`、`RATE_LIMITED`。
   * 出处：`skill.action.ts:73-80`、`skill.service.ts:364-381`。
   */
  jadeGrant(count: number, options?: SendOptions): Promise<ActionResult<JadeGrantData>> {
    return this.transport.request<JadeGrantData>(
      SKILL_CMD.cmd,
      SKILL_CMD.jadeGrant,
      { count },
      options,
    );
  }
}

// ===== economy 段（cmd 70）=====

/** economy 段：通货 / 精华 / 炼器（07 §2.6）。 */
export class EconomyApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 通货清单与持有量。无业务码。
   * 出处：`economy.action.ts:23-28`、`currency.service.ts:44-70`。
   */
  currencies(options?: SendOptions): Promise<ActionResult<CurrenciesData>> {
    return this.transport.request<CurrenciesData>(
      ECONOMY_CMD.cmd,
      ECONOMY_CMD.currencies,
      {},
      options,
    );
  }

  /**
   * 注入通货（dev 接口）。
   * 失败码：`INVALID_PARAM`（code 缺失 / count 非 1~9999）、`FORBIDDEN`、`RATE_LIMITED`、
   * `CURRENCY_NOT_FOUND`。
   * 出处：`economy.action.ts:30-39`、`currency.service.ts:73-109`。
   */
  currencyGrant(
    input: CurrencyGrantInput,
    options?: SendOptions,
  ): Promise<ActionResult<CurrencyGrantData>> {
    return this.transport.request<CurrencyGrantData>(
      ECONOMY_CMD.cmd,
      ECONOMY_CMD.currencyGrant,
      input,
      options,
    );
  }

  /**
   * 炼器（14 种 `CRAFT_OPS`）。
   *
   * 业务失败是**预期分支**（`{ allowBusinessFailure: true }`），失败码较多：
   * `INVALID_PARAM`、`INVALID_OP`、`ITEM_NOT_FOUND`、`ITEM_NOT_OWNED`、`ITEM_NOT_IN_BAG`、
   * `LEGENDARY_IMMUTABLE`、`VAALED_IMMUTABLE`、`RARITY_MISMATCH`、`MAX_AFFIXES`、
   * `NO_AFFIX_TO_REMOVE`、`AFFIX_LIMIT`、`MIRROR_IMMUTABLE`、`FRACTURE_REQUIREMENT`、
   * `AFFIX_NOT_FOUND`、`ESSENCE_NOT_FOUND`、`NOT_AVAILABLE`、`NOT_ENOUGH_ESSENCE`、
   * `NOT_ENOUGH_CURRENCY`；成功也分「未摧毁 / 瓦尔摧毁」两支（`CraftResultData`）。
   * 出处：`economy.action.ts:41-56`、`craft.service.ts:71-404`。
   */
  craft(input: CraftInput, options?: SendOptions): Promise<ActionResult<CraftResultData>> {
    return this.transport.request<CraftResultData>(
      ECONOMY_CMD.cmd,
      ECONOMY_CMD.craft,
      input,
      expectedBusinessFailure(options),
    );
  }

  /**
   * 精华清单与持有量。无业务码。
   * 出处：`economy.action.ts:58-63`、`currency.service.ts:113-140`。
   */
  essences(options?: SendOptions): Promise<ActionResult<EssencesData>> {
    return this.transport.request<EssencesData>(ECONOMY_CMD.cmd, ECONOMY_CMD.essences, {}, options);
  }

  /**
   * 注入精华（dev 接口）。
   * 失败码：`INVALID_PARAM`（count 非 1~99）、`FORBIDDEN`、`RATE_LIMITED`、`ESSENCE_NOT_FOUND`。
   * 出处：`economy.action.ts:65-74`、`currency.service.ts:142-175`。
   */
  essenceGrant(
    input: EssenceGrantInput,
    options?: SendOptions,
  ): Promise<ActionResult<EssenceGrantData>> {
    return this.transport.request<EssenceGrantData>(
      ECONOMY_CMD.cmd,
      ECONOMY_CMD.essenceGrant,
      input,
      options,
    );
  }
}

// ===== realm 段（cmd 80）=====

/** realm 段：境界与突破（07 §2.7）。 */
export class RealmApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 突破信息（当前境界 / 灵韵 / 下一境消耗；封顶 `isMax` 且 `nextCost=null`）。无业务码。
   * 出处：`realm.action.ts:20-25`、`realm.service.ts:35-50`。
   */
  breakthroughInfo(options?: SendOptions): Promise<ActionResult<RealmStatusData>> {
    return this.transport.request<RealmStatusData>(
      REALM_CMD.cmd,
      REALM_CMD.breakthroughInfo,
      {},
      options,
    );
  }

  /**
   * 突破到下一境（消耗灵韵）。
   * 失败码：`MAX_REALM_REACHED`、`REALM_CHANGED`、`LINGYUN_NOT_ENOUGH`。
   * 出处：`realm.action.ts:27-32`、`realm.service.ts:52-78`。
   */
  breakthrough(options?: SendOptions): Promise<ActionResult<BreakthroughData>> {
    return this.transport.request<BreakthroughData>(REALM_CMD.cmd, REALM_CMD.breakthrough, {}, options);
  }
}

// ===== combat 段（cmd 90）=====

/** combat 段：单位图鉴 / 掉落表 / 生成与击杀（07 §2.8）。 */
export class CombatApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 单位图鉴（可按 `realm` / `camp` 过滤）。失败码：`INVALID_PARAM`。
   * 出处：`combat.action.ts:23-37`、`unit.service.ts:269-318`。
   */
  units(params: UnitsQuery = {}, options?: SendOptions): Promise<ActionResult<CombatUnitsData>> {
    return this.transport.request<CombatUnitsData>(COMBAT_CMD.cmd, COMBAT_CMD.units, params, options);
  }

  /**
   * 掉落表全量。无业务码。
   * 出处：`combat.action.ts:39-44`、`unit.service.ts:320-352`。
   */
  dropTables(options?: SendOptions): Promise<ActionResult<DropTablesData>> {
    return this.transport.request<DropTablesData>(COMBAT_CMD.cmd, COMBAT_CMD.dropTables, {}, options);
  }

  /**
   * 生成单位实例（dev 接口，生产禁用）。
   *
   * 业务失败是**预期分支**（`{ allowBusinessFailure: true }`）：
   * `INVALID_PARAM`、`FORBIDDEN`、`RATE_LIMITED`、`UNIT_NOT_FOUND`。
   * 出处：`combat.action.ts:46-55`、`unit.service.ts:356-375`。
   */
  spawn(input: SpawnUnitInput, options?: SendOptions): Promise<ActionResult<UnitSpawnData>> {
    return this.transport.request<UnitSpawnData>(
      COMBAT_CMD.cmd,
      COMBAT_CMD.spawn,
      input,
      expectedBusinessFailure(options),
    );
  }

  /**
   * 击杀单位并结算（dev 接口，生产禁用）。
   *
   * 业务失败是**预期分支**（`{ allowBusinessFailure: true }`）：
   * `INVALID_PARAM`、`FORBIDDEN`、`RATE_LIMITED`、`UNIT_NOT_FOUND`、`NOT_KILLABLE`。
   * 出处：`combat.action.ts:57-66`、`unit.service.ts:437-585`。
   */
  kill(input: KillUnitInput, options?: SendOptions): Promise<ActionResult<SettlementData>> {
    const { code, count = 1 } = input;
    return this.transport.request<SettlementData>(
      COMBAT_CMD.cmd,
      COMBAT_CMD.kill,
      { code, count },
      expectedBusinessFailure(options),
    );
  }
}

// ===== zone 段（cmd 100）=====

/** zone 段：秘境列表 / 进度 / 进入 / 挑战（07 §2.9）。 */
export class ZoneApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 秘境列表（含解锁状态与进度）。无业务码。
   * 出处：`zone.action.ts:22-27`、`zone.service.ts:187-227`。
   */
  zones(options?: SendOptions): Promise<ActionResult<ZonesData>> {
    return this.transport.request<ZonesData>(ZONE_CMD.cmd, ZONE_CMD.zones, {}, options);
  }

  /**
   * 当前秘境进度（楼层 / 战力 / 能否挑战）。失败码：`ZONE_NOT_FOUND`。
   * 出处：`zone.action.ts:29-34`、`zone.service.ts:229-262`。
   */
  progress(options?: SendOptions): Promise<ActionResult<ZoneProgressData>> {
    return this.transport.request<ZoneProgressData>(ZONE_CMD.cmd, ZONE_CMD.progress, {}, options);
  }

  /**
   * 进入秘境。
   *
   * 业务失败是**预期分支**（`{ allowBusinessFailure: true }`）：
   * `INVALID_PARAM`、`ZONE_NOT_FOUND`、`REALM_TOO_LOW`（data 额外含 required/current）、
   * `ZONE_LOCKED`（data 额外含 reason/prevZone/requiredPrevBestFloor/prevBestFloor）——
   * 两者按 `ZoneFailData`（07 §5.9）解析。
   * 出处：`zone.action.ts:36-43`、`zone.service.ts:264-288`。
   */
  enter(zoneCode: string, options?: SendOptions): Promise<ActionResult<ZoneEnterData>> {
    return this.transport.request<ZoneEnterData>(
      ZONE_CMD.cmd,
      ZONE_CMD.enter,
      { zoneCode },
      expectedBusinessFailure(options),
    );
  }

  /**
   * 挑战当前/指定秘境的一层。
   *
   * 业务失败是**预期分支**（`{ allowBusinessFailure: true }`）：
   * `INVALID_PARAM`、`ZONE_NOT_FOUND`、`REALM_TOO_LOW`、`ZONE_LOCKED`、
   * `ALREADY_CLEARED`、`CHALLENGE_FAILED`（四者 data 形状见 `ZoneFailData`，07 §5.9）、
   * `UNIT_NOT_FOUND`、`NOT_KILLABLE`。
   * 出处：`zone.action.ts:45-56`、`zone.service.ts:290-383`。
   */
  challenge(zoneCode?: string, options?: SendOptions): Promise<ActionResult<ZoneChallengeData>> {
    return this.transport.request<ZoneChallengeData>(
      ZONE_CMD.cmd,
      ZONE_CMD.challenge,
      zoneCode === undefined ? {} : { zoneCode },
      expectedBusinessFailure(options),
    );
  }

  /**
   * 在线历练实况（P3.0 T5/T6）：一帧「此刻」的服务端权威状态。
   *
   * 无业务失败码：离线 / 未进秘境 / 不在秘境峰都是**成功信封**，用 `data.reason` 区分，
   * 因此**不加** `allowBusinessFailure`。同一 `(100,5)` 也是服务端推送的路由
   * （`root-store` 会把 `ZONE_CMD.cmd` 的推送转给 zone store 的 `handleNotification`）。
   */
  online(options?: SendOptions): Promise<ActionResult<ZoneOnlineData>> {
    return this.transport.request<ZoneOnlineData>(ZONE_CMD.cmd, ZONE_CMD.online, {}, options);
  }

  /**
   * 页面可见性上报（P3.0 T2）：`visibilitychange` 时调用。
   *
   * ⚠️ 只上报「可见 / 不可见」，**不上报任何时长**（时长可伪造，R2 §4.2 红线）。
   * 失败码：`INVALID_PARAM`（visible 非 boolean）、`UNAUTHORIZED`。
   */
  visibility(visible: boolean, options?: SendOptions): Promise<ActionResult<ZoneVisibilityData>> {
    return this.transport.request<ZoneVisibilityData>(
      ZONE_CMD.cmd,
      ZONE_CMD.visibility,
      { visible },
      expectedBusinessFailure(options),
    );
  }
}

// ===== map 段（cmd 140）=====

/**
 * map 段：地图线路图 / 跑图进入 / 传送点直达（settings-revision-2 §5.2/§5.3/§7）。
 *
 * 服务端只下发**已发现**的节点与两端均已发现的边（§5.2「到达即发现」）；
 * `featureKey` 原样透传，是否「未开放」由客户端 registry 判断（§7.3）。
 */
export class MapApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 地图列表（线路图节点 + 边 + 该角色进度）。无业务码。
   * 出处：`map.action.ts` 的 `list`、`map.service.ts` 的 `panel`。
   */
  list(options?: SendOptions): Promise<ActionResult<MapPanelData>> {
    return this.transport.request<MapPanelData>(MAP_CMD.cmd, MAP_CMD.list, {}, options);
  }

  /**
   * 跑图：从当前节点移动到目标节点。
   *
   * 业务失败是**预期分支**（`{ allowBusinessFailure: true }`）：
   * `INVALID_PARAM`、`NODE_NOT_FOUND`、`NODE_NOT_ADJACENT`（P2.0 v3 §5：与当前所在地不相邻且非山门）
   * ——按 `MapFailData` 解析。**战力不再参与闸门**（`NODE_POWER_NOT_ENOUGH` 已不由 map 域抛出）。
   * 出处：`map.action.ts` 的 `enter`、`map.service.ts` 的 `enter`。
   */
  enter(nodeCode: string, options?: SendOptions): Promise<ActionResult<MapEnterData>> {
    return this.transport.request<MapEnterData>(
      MAP_CMD.cmd,
      MAP_CMD.enter,
      { nodeCode },
      expectedBusinessFailure(options),
    );
  }

  /**
   * 传送：直达任意已点亮传送点的节点（§5.2，跳过跑图）。
   *
   * 业务失败是**预期分支**（`{ allowBusinessFailure: true }`）：
   * `INVALID_PARAM`、`NODE_NOT_FOUND`、`NODE_NOT_VISITED`、`WAYPOINT_NOT_UNLOCKED`
   * （后两者按 `MapFailData` 解析）。
   * 出处：`map.action.ts` 的 `waypoint`、`map.service.ts` 的 `waypoint`。
   */
  waypoint(nodeCode: string, options?: SendOptions): Promise<ActionResult<MapWaypointData>> {
    return this.transport.request<MapWaypointData>(
      MAP_CMD.cmd,
      MAP_CMD.waypoint,
      { nodeCode },
      expectedBusinessFailure(options),
    );
  }
}

// ===== quest 段（cmd 110）=====
/** quest 段：任务 / 章节 + 一次性补发同步（07 §2.10）。 */
export class QuestApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 任务列表。无业务码。
   * 出处：`quest.action.ts:24-29`、`quest.service.ts:154-182`。
   */
  list(options?: SendOptions): Promise<ActionResult<QuestListData>> {
    return this.transport.request<QuestListData>(QUEST_CMD.cmd, QUEST_CMD.list, {}, options);
  }

  /**
   * 任务详情（含触发条件 / 奖励 / 对话 / 后续任务）。
   * 失败码：`INVALID_PARAM`、`QUEST_NOT_FOUND`。
   * 出处：`quest.action.ts:31-38`、`quest.service.ts:184-218`。
   */
  detail(code: string, options?: SendOptions): Promise<ActionResult<QuestDetailData>> {
    return this.transport.request<QuestDetailData>(QUEST_CMD.cmd, QUEST_CMD.detail, { code }, options);
  }

  /**
   * 任务奖励补发同步（幂等，返回本次补发明细与累计）。无业务码。
   * 出处：`quest.action.ts:40-45`、`quest.service.ts:249-331`。
   */
  sync(options?: SendOptions): Promise<ActionResult<QuestSyncData>> {
    return this.transport.request<QuestSyncData>(QUEST_CMD.cmd, QUEST_CMD.sync, {}, options);
  }

  /**
   * 章节列表（含当前章节与解锁状态）。无业务码。
   * 出处：`quest.action.ts:47-52`、`chapter.service.ts:78-126`。
   */
  chapterList(options?: SendOptions): Promise<ActionResult<ChapterListData>> {
    return this.transport.request<ChapterListData>(QUEST_CMD.cmd, QUEST_CMD.chapterList, {}, options);
  }

  /**
   * 章节详情（`chapter` 支持序号字符串或 code）。
   * 失败码：`INVALID_PARAM`、`CHAPTER_NOT_FOUND`。
   * 出处：`quest.action.ts:54-61`、`chapter.service.ts:128-183`。
   */
  chapterDetail(chapter: string, options?: SendOptions): Promise<ActionResult<ChapterDetailData>> {
    return this.transport.request<ChapterDetailData>(
      QUEST_CMD.cmd,
      QUEST_CMD.chapterDetail,
      { chapter },
      options,
    );
  }

  /**
   * 章节奖励补发同步。无业务码。
   * 出处：`quest.action.ts:63-68`、`chapter.service.ts:185-257`。
   */
  chapterSync(options?: SendOptions): Promise<ActionResult<ChapterSyncData>> {
    return this.transport.request<ChapterSyncData>(QUEST_CMD.cmd, QUEST_CMD.chapterSync, {}, options);
  }
}

// ===== story 段（cmd 120）=====

/** story 段：剧情节点文本与已读标记（07 §2.11）。 */
export class StoryApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 章节剧情节点（`chapter` 支持序号或 code）。
   * 失败码：`INVALID_PARAM`、`CHAPTER_NOT_FOUND`。
   * 出处：`story.action.ts:21-28`、`story.service.ts:84-112`。
   */
  chapter(chapter: string, options?: SendOptions): Promise<ActionResult<StoryChapterData>> {
    return this.transport.request<StoryChapterData>(
      STORY_CMD.cmd,
      STORY_CMD.chapter,
      { chapter },
      options,
    );
  }

  /**
   * 任务剧情节点。
   * 失败码：`INVALID_PARAM`、`QUEST_NOT_FOUND`。
   * 出处：`story.action.ts:30-37`、`story.service.ts:114-128`。
   */
  quest(code: string, options?: SendOptions): Promise<ActionResult<StoryQuestData>> {
    return this.transport.request<StoryQuestData>(STORY_CMD.cmd, STORY_CMD.quest, { code }, options);
  }

  /**
   * 标记剧情节点已读。
   * 失败码：`INVALID_PARAM`（nodeKey 需 1~120 字符）。
   * 出处：`story.action.ts:39-46`、`story.service.ts:130-140`。
   */
  seen(nodeKey: string, options?: SendOptions): Promise<ActionResult<StorySeenData>> {
    return this.transport.request<StorySeenData>(STORY_CMD.cmd, STORY_CMD.seen, { nodeKey }, options);
  }
}

// ===== idle 段（cmd 130）=====

/** idle 段：离线挂机状态与结算（07 §2.12）。 */
export class IdleApi {
  constructor(private readonly transport: GameApiTransport) {}

  /**
   * 挂机状态（待结算时长 / 预估收益 / 今日产出上限）。无业务码。
   * 出处：`idle.action.ts:29-34`、`idle.service.ts:85-107`。
   */
  status(options?: SendOptions): Promise<ActionResult<IdleStatusData>> {
    return this.transport.request<IdleStatusData>(IDLE_CMD.cmd, IDLE_CMD.status, {}, options);
  }

  /**
   * 结算离线挂机收益。
   *
   * 业务失败是**预期分支**（`{ allowBusinessFailure: true }`）：
   * `INVALID_PARAM`、`FORBIDDEN`（生产环境不支持 `hours` 覆盖）、`ZONE_NOT_FOUND`、
   * `UNIT_NOT_FOUND`、`NOT_KILLABLE`。
   * 成功分「正常结算」与「无可结算」两支（`IdleSettleResultData`，07 §2.12/§5.12）。
   * 出处：`idle.action.ts:36-58`、`idle.service.ts:109-201`。
   */
  settle(
    params: IdleSettleInput = {},
    options?: SendOptions,
  ): Promise<ActionResult<IdleSettleResultData>> {
    return this.transport.request<IdleSettleResultData>(
      IDLE_CMD.cmd,
      IDLE_CMD.settle,
      params,
      expectedBusinessFailure(options),
    );
  }
}

// ===== 聚合入口 =====

/**
 * 12 个域 API 的聚合入口（每个域类只依赖注入的 `GameApiTransport`，可独立实例化与测试）。
 *
 * 用法：`const api = new GameApi(client); await api.zone.enter('qingyun');`
 */
export class GameApi {
  readonly system: SystemApi;
  readonly item: ItemApi;
  readonly prop: PropApi;
  readonly equip: EquipApi;
  readonly skill: SkillApi;
  readonly economy: EconomyApi;
  readonly realm: RealmApi;
  readonly combat: CombatApi;
  readonly zone: ZoneApi;
  readonly quest: QuestApi;
  readonly story: StoryApi;
  readonly idle: IdleApi;
  readonly map: MapApi;

  constructor(transport: GameApiTransport) {
    this.system = new SystemApi(transport);
    this.item = new ItemApi(transport);
    this.prop = new PropApi(transport);
    this.equip = new EquipApi(transport);
    this.skill = new SkillApi(transport);
    this.economy = new EconomyApi(transport);
    this.realm = new RealmApi(transport);
    this.combat = new CombatApi(transport);
    this.zone = new ZoneApi(transport);
    this.quest = new QuestApi(transport);
    this.story = new StoryApi(transport);
    this.idle = new IdleApi(transport);
    this.map = new MapApi(transport);
  }
}
