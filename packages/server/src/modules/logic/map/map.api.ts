/**
 * map 域对外公开类型（settings-revision-2 §5）。
 *
 * 跨逻辑服只允许引用本文件（公开类型）与 `map.logic.service.ts`（门面），
 * 禁止直连 `map/internal/`（`scripts/lib/dep-rules.ts` 的 findInternalLeaks）。
 */

/**
 * 秘境层数推进事件（zone 域 → map 域）。
 *
 * **层数判定归 zone 域**（`isBossFloor` / `max_floor`）；map 域只根据该事件置位
 * 地图节点的 `idle_unlocked`，不重复实现任何层数逻辑（§5.5 / D2）。
 */
export interface ZoneFloorAdvancedEvent {
  /** 秘境 code（`game_zones.code`） */
  zoneCode: string;
  /** 本次挑战所通过的层（推进前的 `progress.floor`） */
  floor: number;
  /** 该层是否 Boss 层（`floor % boss_every_floors === 0` 且有 boss_code） */
  isBossFloor: boolean;
  /** 本次挑战是否使秘境通关（`nextFloor > max_floor`） */
  cleared: boolean;
}

/** `onZoneFloorPassed` 结果：是否真的发生了 idle_unlocked 置位。 */
export interface ZoneIdleUnlockResult {
  /** 本次调用是否写入了 `idle_unlocked = TRUE`（幂等：重复调用为 false） */
  changed: boolean;
  nodeCode: string | null;
  /**
   * - `unlocked`：本次完成置位
   * - `already_unlocked`：此前已置位（幂等）
   * - `not_boss`：非 Boss 层且未通关，不置位
   * - `no_map_node`：该秘境没有挂在任何地图节点上（遗留秘境，过渡规则）
   */
  reason: 'unlocked' | 'already_unlocked' | 'not_boss' | 'no_map_node';
}

/** 离线挂机闸门判定结果（idle 域 → map 域）。 */
export interface ZoneIdleGate {
  /**
   * 是否受新闸门约束。
   *
   * **过渡规则**：只有「挂在某个地图节点上的秘境」（当前仅 `zone_houshan`）才为 `true`；
   * 5 个遗留秘境（`zone_qingyun` / `zone_miwu` / `zone_guhai` / `zone_dajie` / `zone_hundun`）
   * 在 `game_map_nodes` 里没有对应节点，`enforced = false`，其离线结算行为**保持不变**。
   */
  enforced: boolean;
  /** 目标秘境的离线挂机是否已解锁（`enforced = false` 时无意义） */
  unlocked: boolean;
  nodeCode: string | null;
  nodeName: string | null;
}
