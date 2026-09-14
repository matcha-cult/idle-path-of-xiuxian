/**
 * IdleBlockedHint —— 「为什么现在不能挂机 / 还没挂机」的原因条（§23 ① G3/G5）。
 *
 * 三种原因，按紧急度取第一条：
 * 1. **在线战斗中** —— 挂机被服务端互斥闸门拒绝（`ONLINE_BATTLE_ACTIVE`），离开秘境即恢复；
 * 2. **没有可挂机的秘境** —— 还没突破任何历练秘境；特殊秘境（6~13 境）不可挂机，
 *    指路到地图「第八峰·后山」的秘境石台；
 * 3. **还没选挂机点** —— 有可选项但没选，离线收益不会结算。
 *
 * 用 ui-kit 的 `LockedHint`（antd `Alert` warning）承载，`hint` 覆盖默认原因文案。
 * 都不成立时渲染 `null`（没有要解释的事，不占版面）。`loading` 期间也不渲染 —— 避免
 * 「正在加载」被误读成「没有可挂机的秘境」。
 */
import { LockedHint } from '@idle-path/ui-kit';

export interface IdleBlockedHintProps {
  /** 是否正在在线战斗中（`game_zone_state` 有行 ⇒ 挂机暂停） */
  inBattle: boolean;
  /** 可挂机的已突破秘境数量 */
  availableCount: number;
  /** 是否已设置挂机点 */
  hasTarget: boolean;
  /** 秘境域是否正在加载（加载中不解释，避免误报） */
  loading?: boolean;
}

export function IdleBlockedHint(props: IdleBlockedHintProps) {
  const { inBattle, availableCount, hasTarget, loading = false } = props;

  if (loading) return null;

  if (inBattle) {
    return (
      <div data-testid="idle-blocked-hint">
        <LockedHint
          title="离线挂机已暂停"
          reason="objective"
          hint="你正在秘境里战斗：在线战斗期间离线挂机一律暂停，离开秘境后自动恢复。"
        />
      </div>
    );
  }

  if (availableCount <= 0) {
    return (
      <div data-testid="idle-blocked-hint">
        <LockedHint
          title="暂无可挂机的秘境"
          reason="objective"
          hint="到地图「第八峰·后山」的秘境石台突破一个历练秘境（1~5 境可挂机，特殊秘境不可挂机）。"
        />
      </div>
    );
  }

  if (!hasTarget) {
    return (
      <div data-testid="idle-blocked-hint">
        <LockedHint
          title="尚未设置挂机点"
          reason="objective"
          hint="选一个已突破的历练秘境作为挂机点，离线收益才会按它结算。"
        />
      </div>
    );
  }

  return null;
}
