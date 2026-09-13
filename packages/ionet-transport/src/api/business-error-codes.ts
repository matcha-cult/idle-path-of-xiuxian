/**
 * 业务错误码文案表（来源：`ai-docs/frontend-solution-exploration/07-后端API面清单.md` §3）。
 *
 * 后端把业务失败放在 Action 结果体的 `data.data.code`（07 §0.3），码值为大写下划线字符串；
 * 本文件把 57 个码（07 §3 的 51 个 + R2 地图域 6 个）映射为可展示的中文文案，供 UI 在 `BusinessError` 文案缺失或需要本地化时兜底。
 *
 * 口径（与 07 §3 一致）：
 * - 「默认/代表文案」取该码在服务端源码中的代表文案；带 `{}` 的是模板串，**保留占位符**，
 *   展示侧可按需替换（替换前应直接展示原文案 —— 服务端 `message` 通常已带具体值）。
 * - 同一个码在不同上下文有不同文案（如 `RARITY_MISMATCH` 有 9 种），此处只收代表文案。
 * - `UNAUTHORIZED` / `INVALID_PARAM` / `FORBIDDEN` / `CHARACTER_NOT_FOUND` 四个
 *   ActionError 通用码也在表内（`action-support.ts:21-27`）。
 * - §3 的 46–49 四个 zone 内联失败码，其 `data` 形状特殊（见 `dto.ts` 的 `ZoneFailData`），
 *   但码值本身仍在本表内。
 *
 * 展示优先级建议：服务端 `message`（具体） > `businessErrorMessage(code)`（兜底） > `'操作失败'`。
 */

/**
 * 全部 57 个业务错误码的字面量联合（07 §3 的 51 个 + R2 地图域 6 个）。
 * 与 `BUSINESS_ERROR_TABLE` 的键集合由 `satisfies` 在编译期强制一一对应。
 */
export type ActionErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_PARAM'
  | 'CHARACTER_NOT_FOUND'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'BASE_NOT_FOUND'
  | 'RARITY_EXCEEDS_LIMIT'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_NOT_OWNED'
  | 'ITEM_NOT_IN_BAG'
  | 'TIER_TOO_HIGH'
  | 'SLOT_OCCUPIED'
  | 'ITEM_NOT_EQUIPPED'
  | 'INVALID_RULE'
  | 'PICKUP_RULE_NOT_FOUND'
  | 'SKILL_NOT_FOUND'
  | 'ALREADY_LEARNED'
  | 'JADE_NOT_ENOUGH'
  | 'SLOTS_INVALID'
  | 'DUPLICATE_SLOT'
  | 'SLOT_COUNT_EXCEEDED'
  | 'NOT_LEARNED'
  | 'MAX_LEVEL_REACHED'
  | 'LINGYUN_NOT_ENOUGH'
  | 'SPIRIT_BUDGET_EXCEEDED'
  | 'INVALID_OP'
  | 'RARITY_MISMATCH'
  | 'MAX_AFFIXES'
  | 'NO_AFFIX_TO_REMOVE'
  | 'AFFIX_LIMIT'
  | 'MIRROR_IMMUTABLE'
  | 'FRACTURE_REQUIREMENT'
  | 'AFFIX_NOT_FOUND'
  | 'ESSENCE_NOT_FOUND'
  | 'NOT_AVAILABLE'
  | 'NOT_ENOUGH_ESSENCE'
  | 'NOT_ENOUGH_CURRENCY'
  | 'LEGENDARY_IMMUTABLE'
  | 'VAALED_IMMUTABLE'
  | 'CURRENCY_NOT_FOUND'
  | 'MAX_REALM_REACHED'
  | 'REALM_CHANGED'
  | 'UNIT_NOT_FOUND'
  | 'NOT_KILLABLE'
  | 'ZONE_NOT_FOUND'
  | 'REALM_TOO_LOW'
  | 'ZONE_LOCKED'
  | 'ALREADY_CLEARED'
  | 'CHALLENGE_FAILED'
  // ===== R2 地图域（map.service.ts，settings-revision-2 §5）=====
  | 'NODE_NOT_FOUND'
  | 'NODE_LOCKED'
  | 'NODE_POWER_NOT_ENOUGH'
  | 'NODE_NOT_VISITED'
  | 'WAYPOINT_NOT_UNLOCKED'
  | 'ZONE_NOT_IDLE_UNLOCKED'
  | 'QUEST_NOT_FOUND'
  | 'CHAPTER_NOT_FOUND';

/**
 * 业务码 → 中文文案（07 §3 的 51 行逐条 + R2 地图域 6 个）。
 * `{}` 占位由服务端 `message` 提供具体值；此表只做兜底。
 */
const BUSINESS_ERROR_TABLE = {
  // ===== 通用（action-support.ts:21-27）=====
  UNAUTHORIZED: '登录状态无效，请重新登录',
  INVALID_PARAM: '参数不合法',
  CHARACTER_NOT_FOUND: '尚未创建角色',
  FORBIDDEN: '开发接口在生产环境不可用',

  // ===== 限流 / 物品基底（item.affix.service.ts、各 dev 接口）=====
  RATE_LIMITED: '调用过于频繁，请稍后再试（每分钟最多 {limit} 次）',
  BASE_NOT_FOUND: '物品基底不存在',
  RARITY_EXCEEDS_LIMIT: '超出基底稀有度上限（最高{name}）',

  // ===== 物品 / 装备（item.service.ts）=====
  ITEM_NOT_FOUND: '物品不存在',
  ITEM_NOT_OWNED: '物品不属于当前角色',
  ITEM_NOT_IN_BAG: '物品不在背包中，无法进行该操作',
  TIER_TOO_HIGH: '当前境界 {realm}，无法装备 T{tier} 物品',
  SLOT_OCCUPIED: '槽位已占用',
  ITEM_NOT_EQUIPPED: '物品未被装备',

  // ===== 拾取规则（item.service.ts:461-528）=====
  INVALID_RULE: '规则名称不能为空',
  PICKUP_RULE_NOT_FOUND: '规则不存在',

  // ===== 功法 / 面板（skill.service.ts）=====
  SKILL_NOT_FOUND: '功法不存在：{code}',
  ALREADY_LEARNED: '该功法已修习',
  JADE_NOT_ENOUGH: '未开光玉简不足（需要 1 枚）',
  SLOTS_INVALID: '面板结构非法',
  DUPLICATE_SLOT: '槽位 code 重复',
  SLOT_COUNT_EXCEEDED: '槽位数量超出上限（辅心法最多 {aux} 个、术法最多 {shufa} 个）',
  NOT_LEARNED: '尚未修习该功法：{code}',
  MAX_LEVEL_REACHED: '已达参悟上限 {level} 级',
  LINGYUN_NOT_ENOUGH: '灵韵不足：需要 {cost}，当前 {cur}',
  SPIRIT_BUDGET_EXCEEDED: '神识占用 {used} 超出预算 {budget}',

  // ===== 炼器（craft.service.ts）=====
  INVALID_OP: '未知炼器操作：{op}',
  RARITY_MISMATCH: '该工艺通货与物品稀有度不匹配',
  MAX_AFFIXES: '词缀已达上限',
  NO_AFFIX_TO_REMOVE: '没有可剥离的词缀',
  AFFIX_LIMIT: '没有可操作的词缀',
  MIRROR_IMMUTABLE: '镜像不可再复制',
  FRACTURE_REQUIREMENT: '破溃宝珠仅限宝品（且宝品至少 4 条词缀）',
  AFFIX_NOT_FOUND: '基底词缀不存在：{code}',
  ESSENCE_NOT_FOUND: '精华不存在：{code}',
  NOT_AVAILABLE: '该底材无「{name}」可定向的词缀',
  NOT_ENOUGH_ESSENCE: '精华不足：需要 1 枚对应精华',
  NOT_ENOUGH_CURRENCY: '通货不足：需要 1 枚对应工艺通货',
  LEGENDARY_IMMUTABLE: '传奇物品词缀固定，不可洗炼',
  VAALED_IMMUTABLE: '瓦尔变异不可逆，此后不可再洗炼',

  // ===== 通货（currency.service.ts）=====
  CURRENCY_NOT_FOUND: '通货不存在：{code}',

  // ===== 境界（realm.service.ts）=====
  MAX_REALM_REACHED: '已达封顶境界（{realmName}）',
  REALM_CHANGED: '境界已变化，请重试',

  // ===== 战斗 / 秘境（unit.service.ts、zone.service.ts）=====
  UNIT_NOT_FOUND: '单位不存在：{code}',
  NOT_KILLABLE: '{name} 非敌对单位，无法击杀',
  ZONE_NOT_FOUND: '秘境不存在：{code}',
  REALM_TOO_LOW: '境界不足：{name}需要 {min} 境',
  ZONE_LOCKED: '尚未解锁：{name}',
  ALREADY_CLEARED: '该秘境已通关：{name}',
  CHALLENGE_FAILED: '挑战失败：战力不足（{power} < {req}）',

  // ===== 地图 / 线路图（map.service.ts，settings-revision-2 §5.2/§5.3）=====
  NODE_NOT_FOUND: '节点不存在：{code}',
  NODE_LOCKED: '节点尚未发现：{name}',
  NODE_POWER_NOT_ENOUGH: '战力不足：{name}（{power} < {req}）',
  NODE_NOT_VISITED: '尚未到达过：{name}',
  WAYPOINT_NOT_UNLOCKED: '传送点未点亮：{name}',
  ZONE_NOT_IDLE_UNLOCKED: '秘境未解锁离线挂机：{name}',

  // ===== 任务 / 章节（quest.service.ts、chapter.service.ts、story.service.ts）=====
  QUEST_NOT_FOUND: '任务不存在：{code}',
  CHAPTER_NOT_FOUND: '章节不存在：{key}',
} as const satisfies Record<ActionErrorCode, string>;

/** 业务码 → 中文兜底文案（57 码，07 §3 + R2 地图域）。未命中码请用 `businessErrorMessage` 取 `'操作失败'`。 */
export const BUSINESS_ERROR_MESSAGES: Record<string, string> = BUSINESS_ERROR_TABLE;

/** `businessErrorMessage` 未命中且无 fallback 时的最终兜底文案。 */
export const DEFAULT_BUSINESS_ERROR_MESSAGE = '操作失败';

/**
 * 取业务码的中文兜底文案。
 *
 * @param code 业务码（`data.data.code`，缺失时为 `UNKNOWN_BUSINESS_CODE`）
 * @param fallback 未命中时的替代文案
 * @returns 命中 → 表内文案；未命中 → `fallback ?? '操作失败'`
 */
export function businessErrorMessage(code: string, fallback?: string): string {
  const known = BUSINESS_ERROR_MESSAGES[code];
  if (known !== undefined) return known;
  return fallback ?? DEFAULT_BUSINESS_ERROR_MESSAGE;
}

/**
 * 传输/框架层 `errorCode` → 中文文案（PROTOCOL.md §8；`ws-protocol-contract.md:62-64`）。
 *
 * 与业务码无关：这三个码由框架 `BarSkeleton.execute` 产出（07 §0.2），
 * **业务失败不占 `errorCode`**（07 §0.2 关键说明）。心跳与普通请求的传输层错误提示用本表。
 */
export const TRANSPORT_ERROR_MESSAGES: Record<number, string> = {
  400: '报文非法：请求不是合法 JSON 或缺少 cmd',
  404: '路由不存在：该命令未被服务端注册',
  500: '服务器内部异常，请稍后重试',
};
