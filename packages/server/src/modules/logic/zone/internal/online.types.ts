/**
 * 在线历练的共享类型（P3.0 T4/T5 保留；§22 重做事件与帧字段）。
 *
 * ⚠️ 前端的镜像类型在 `packages/ionet-transport/src/api/dto.ts` 的 `ZoneOnlineData`
 * （本仓 DTO 一贯手工镜像，唯一真相在后端；改这里必须同步那边）。
 */

/** 在线结算事件（推送与面板共用）。 */
export type ZoneOnlineEvent =
  /** 涨到下一普通层 */
  | 'floor_up'
  /** 进入 Boss 层（Boss 未击败前不涨层） */
  | 'boss_floor'
  /** 击败 Boss（= 打满一轮的最后一拍） */
  | 'boss_defeated'
  /** §22：首个周目打满 ⇒ 秘境被突破（clears 0→1），出现在秘境页面 */
  | 'realm_unlocked'
  /** 战力不足，原地刷当前层（有产出、无进度） */
  | 'stuck';

/**
 * 不推进的原因：
 * - `ok`：正在战斗；
 * - `hidden`：会话活着但页面不可见（切后台不算在线）；
 * - `no_session`：没有活着的 WS 会话；
 * - `no_battle`：没有当前战斗（`game_zone_state` 无行 —— 没进秘境 / 刚自动退出）。
 */
export type ZoneOnlineReason = 'ok' | 'hidden' | 'no_session' | 'no_battle';

/**
 * 在线历练帧（`zone.online` 的 data / `zone.online` 推送的 data）。
 *
 * `kills` / `lingyunGained` 是「自上次推送以来」的累计；面板读一次时恒为 0
 * （读接口不消费产出摘要）。
 */
export interface ZoneOnlineFrame {
  online: boolean;
  exploring: boolean;
  reason: ZoneOnlineReason;
  zone: { code: string; name: string; realm: number } | null;
  floor: number;
  maxFloor: number;
  bestFloor: number;
  cleared: boolean;
  /** §22：周目计数（`clears ≥ 1` ⇔ 已突破；首周目打满推 `realm_unlocked`） */
  clears: number;
  isBossFloor: boolean;
  playerPower: number;
  floorRequirement: number;
  /** 本层已累计击杀（在线期间的内存计数） */
  floorKills: number;
  /** 本层涨层门槛击杀数 */
  killsPerFloor: number;
  /** 战力不足（卡层） */
  stuck: boolean;
  /** 卡层时还差多少战力（达标为 0） */
  shortfall: number;
  kills: number;
  lingyunGained: number;
  events: ZoneOnlineEvent[];
  /** 节拍与节流（下发给前端只用于文案说明，客户端**不**据此本地推进） */
  tickMs: number;
  pushEveryMs: number;
}