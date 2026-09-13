/**
 * ionet Action cmd 分段规划（v2 定稿，见 ai-docs/http-ws-logic-server-refactor-plan.md）
 *
 * 约定：
 * - 一个逻辑服占用一个 cmd 段；段内 subCmd 从 1 起，0 保留；
 * - 段与段之间留 10 的间隔，便于后续在同域内扩容而不与相邻段冲突；
 * - HTTP 基础能力（auth/character）也保留 cmd 段，仅作占位与未来迁移预留，
 *   当前不注册任何 Action；
 * - 新增 Action 只能落在已登记的段与 subCmd 上，禁止跨段乱用；
 * - 对外服（Edge）不承载业务路由，不占用 cmd 段。
 *
 * 依赖方向：边只能由「上层」指向「下层」，禁止循环依赖。
 *
 *   Edge(对外服)  ← NotificationPort 单向投递
 *   L4 idle
 *   L3 quest → story
 *   L2 zone → map（zone 层数推进挂钩 map；map 不反向依赖 zone）
 *   L1 combat · realm · economy
 *   L0 prop → equip → skill
 *   L-1 item · character(HTTP) · system/stat
 */
export const CMD_SEGMENTS = {
  /** 系统/健康（同 demo HALL=1） */
  system: 1,
  /** 用户认证（HTTP：注册/登录/JWT，预留 ionet 通道） */
  auth: 10,
  /** 角色（HTTP：创建/查询/属性，预留 ionet 通道） */
  character: 20,
  /** L-1 物品逻辑服：物品基底/词缀/实例化/背包存储/拾取规则 */
  item: 30,
  /** L0 道具逻辑服：获得/消耗/丢弃/分解/出售 的流转与门禁（依赖 item） */
  prop: 40,
  /** L0 装备逻辑服：穿戴/卸下/装备栏/属性聚合（依赖 item） */
  equip: 50,
  /** L0 功法逻辑服：修习/装配/参悟（依赖 character） */
  skill: 60,
  /** L1 通货/炼器逻辑服：通货/精华/炼器十四操作（依赖 item, prop） */
  economy: 70,
  /** L1 境界逻辑服：境界突破（依赖 character, prop） */
  realm: 80,
  /** L1 战斗逻辑服：单位实例化/击杀结算/掉落/辨宝（依赖 item, equip） */
  combat: 90,
  /** L2 秘境逻辑服：层数挑战/推进/解锁（依赖 combat, item, equip） */
  zone: 100,
  /** L3 任务逻辑服：任务流转/章节（依赖 zone, combat, item） */
  quest: 110,
  /** L3 剧情逻辑服：剧本节点/已读（依赖 quest） */
  story: 120,
  /** L4 挂机逻辑服：离线收益结算循环（依赖 item, equip, combat, zone） */
  idle: 130,
  /** L2 地图逻辑服：线路图/传送点/秘境发现与离线解锁闸门（依赖 zone 的层数推进挂钩） */
  map: 140,
} as const;

/** 系统/健康段 */
export const SYSTEM_CMD = {
  cmd: CMD_SEGMENTS.system,
  /** GET /api/health（HTTP）同源能力 | WS: system.ping */
  ping: 1,
} as const;

/** 物品段（L-1）—— 旧 REST: /api/game/inventory*、/api/game/item/bases、/api/game/pickup-rules* */
export const ITEM_CMD = {
  cmd: CMD_SEGMENTS.item,
  inventory: 1,
  inventoryDetail: 2,
  bases: 3,
  pickupRuleList: 4,
  pickupRuleCreate: 5,
  pickupRuleUpdate: 6,
  pickupRuleDelete: 7,
} as const;

/** 道具段（L0，依赖 item）—— 旧 REST: /api/game/item/discard、/api/game/item/generate(dev) */
export const PROP_CMD = {
  cmd: CMD_SEGMENTS.prop,
  discard: 1,
  generate: 2,
} as const;

/** 装备段（L0，依赖 item）—— 旧 REST: /api/game/item/equip|unequip、/api/game/equipment */
export const EQUIP_CMD = {
  cmd: CMD_SEGMENTS.equip,
  equip: 1,
  unequip: 2,
  equipment: 3,
} as const;

/** 功法段（L0，依赖 character）—— 旧 REST: /api/game/skills、/api/game/skill/*、/api/game/lingyun/grant */
export const SKILL_CMD = {
  cmd: CMD_SEGMENTS.skill,
  list: 1,
  learn: 2,
  panel: 3,
  panelUpdate: 4,
  enlighten: 5,
  lingyunGrant: 6,
  jadeGrant: 7,
} as const;

/** 通货/炼器段（L1，依赖 item, prop）—— 旧 REST: /api/game/currencies、/api/game/currency/grant、/api/game/item/craft、/api/game/essences、/api/game/essence/grant */
export const ECONOMY_CMD = {
  cmd: CMD_SEGMENTS.economy,
  currencies: 1,
  currencyGrant: 2,
  craft: 3,
  essences: 4,
  essenceGrant: 5,
} as const;

/** 境界段（L1，依赖 character, prop）—— 旧 REST: GET/POST /api/game/breakthrough */
export const REALM_CMD = {
  cmd: CMD_SEGMENTS.realm,
  breakthroughInfo: 1,
  breakthrough: 2,
} as const;

/** 战斗段（L1，依赖 item, equip）—— 旧 REST: /api/game/units、/api/game/drop-tables、/api/game/unit/spawn|kill */
export const COMBAT_CMD = {
  cmd: CMD_SEGMENTS.combat,
  units: 1,
  dropTables: 2,
  spawn: 3,
  kill: 4,
} as const;

/** 秘境段（L2，依赖 combat, item, equip）—— 旧 REST: /api/game/zones、/api/game/zone/progress|enter|challenge */
export const ZONE_CMD = {
  cmd: CMD_SEGMENTS.zone,
  zones: 1,
  progress: 2,
  enter: 3,
  challenge: 4,
} as const;

/** 任务段（L3，依赖 zone, combat, item）—— 旧 REST: /api/game/quests*、/api/game/quest/sync、/api/game/chapters*、/api/game/chapter/sync */
export const QUEST_CMD = {
  cmd: CMD_SEGMENTS.quest,
  list: 1,
  detail: 2,
  sync: 3,
  chapterList: 4,
  chapterDetail: 5,
  chapterSync: 6,
} as const;

/** 剧情段（L3，依赖 quest）—— 旧 REST: /api/game/story/chapter/:chapter、/api/game/story/quest/:code、/api/game/story/seen */
export const STORY_CMD = {
  cmd: CMD_SEGMENTS.story,
  chapter: 1,
  quest: 2,
  seen: 3,
} as const;

/** 挂机段（L4，依赖 item, equip, combat, zone）—— 旧 REST: /api/game/idle/status|settle */
export const IDLE_CMD = {
  cmd: CMD_SEGMENTS.idle,
  status: 1,
  settle: 2,
} as const;

/**
 * 地图段（L2，依赖 zone 的层数推进挂钩 + character 战力）
 * （settings-revision-2 §5 / §7；无旧 REST 对应，纯新增域）
 */
export const MAP_CMD = {
  cmd: CMD_SEGMENTS.map,
  /** 地图线路图 + 节点 + 边 + 角色进度（只下发已发现节点） */
  list: 1,
  /** 跑图：移动到目标节点（已发现 + 战力门槛） */
  enter: 2,
  /** 传送：直达已点亮的传送点节点 */
  waypoint: 3,
} as const;

/**
 * 免鉴权 Action 白名单（cmdMerge 键：(cmd << 16) | subCmd）。
 * 其余 Action 必须携带合法 token，否则 WsAuthInOut 不会绑定 userId。
 */
export function cmdMerge(cmd: number, subCmd: number): number {
  return (cmd << 16) | subCmd;
}

export const PUBLIC_ACTION_KEYS: ReadonlySet<number> = new Set<number>([
  cmdMerge(SYSTEM_CMD.cmd, SYSTEM_CMD.ping),
]);
