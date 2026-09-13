/**
 * 前端 command 常量表（镜像后端 `packages/server/src/ionet/cmd.ts`）。
 *
 * ⚠️ 这是**手工镜像**，唯一真相在后端 `cmd.ts`；后端新增/调整段与 subCmd 时必须同步本文件。
 * 后端约定：段宽 10、段内 subCmd 从 1 起、0 保留（06 §1 S6）。
 */

export const CMD_SEGMENTS = {
  system: 1,
  auth: 10,
  character: 20,
  item: 30,
  prop: 40,
  equip: 50,
  skill: 60,
  economy: 70,
  realm: 80,
  combat: 90,
  zone: 100,
  quest: 110,
  story: 120,
  idle: 130,
  map: 140,
} as const;

export const SYSTEM_CMD = { cmd: CMD_SEGMENTS.system, ping: 1 } as const;

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

export const PROP_CMD = { cmd: CMD_SEGMENTS.prop, discard: 1, generate: 2 } as const;

export const EQUIP_CMD = { cmd: CMD_SEGMENTS.equip, equip: 1, unequip: 2, equipment: 3 } as const;

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

export const ECONOMY_CMD = {
  cmd: CMD_SEGMENTS.economy,
  currencies: 1,
  currencyGrant: 2,
  craft: 3,
  essences: 4,
  essenceGrant: 5,
} as const;

export const REALM_CMD = {
  cmd: CMD_SEGMENTS.realm,
  breakthroughInfo: 1,
  breakthrough: 2,
} as const;

export const COMBAT_CMD = {
  cmd: CMD_SEGMENTS.combat,
  units: 1,
  dropTables: 2,
  spawn: 3,
  kill: 4,
} as const;

export const ZONE_CMD = {
  cmd: CMD_SEGMENTS.zone,
  zones: 1,
  progress: 2,
  enter: 3,
  challenge: 4,
} as const;

export const QUEST_CMD = {
  cmd: CMD_SEGMENTS.quest,
  list: 1,
  detail: 2,
  sync: 3,
  chapterList: 4,
  chapterDetail: 5,
  chapterSync: 6,
} as const;

export const STORY_CMD = { cmd: CMD_SEGMENTS.story, chapter: 1, quest: 2, seen: 3 } as const;

export const IDLE_CMD = { cmd: CMD_SEGMENTS.idle, status: 1, settle: 2 } as const;

export const MAP_CMD = { cmd: CMD_SEGMENTS.map, list: 1, enter: 2, waypoint: 3 } as const;

/** 免鉴权 Action 白名单（PROTOCOL.md §7：心跳可免鉴权）。 */
export const PUBLIC_ACTION_KEYS: ReadonlySet<string> = new Set<string>([
  `${SYSTEM_CMD.cmd}:${SYSTEM_CMD.ping}`,
]);

/** 应用层心跳路由（PROTOCOL.md §7，免鉴权）。 */
export const HEARTBEAT_ROUTE = { cmd: SYSTEM_CMD.cmd, subCmd: SYSTEM_CMD.ping } as const;
