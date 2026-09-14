/**
 * 境界面板的**展示判定**（纯函数，单独成文件便于单测，也让 `RealmPanel.tsx` 守住 200 行）。
 *
 * 这里只做「把服务端给的值翻译成玩家看得懂的话」与「拼破境解锁明细」，
 * **不含任何业务规则**：能不能破境由服务端 `RealmStatusData` 决定，可进秘境只 join
 * 突破名录（§22 起秘境没有境界闸门，见下）。
 */
import { REALMS, type RealmStatusData, type ZoneBreakthroughView } from '@idle-path/ionet-transport';
import type { KeyValueEntry } from '@idle-path/ui-kit';
import { formatCompactNumber } from '../../../domain/format.js';

/** 境界总数（14 境，来自协议常量，不本地硬编码）。 */
export const TOTAL_REALMS = REALMS.length;

/** 下一境名（封顶或越界给占位符）。 */
export function nextRealmName(realm: number, isMax: boolean): string {
  if (isMax) return '—';
  const name: string | undefined = REALMS[realm];
  return name ?? '—';
}

/** 破境后可穿的装备阶：下一境即 `T{realm+1}`，封顶则维持当前阶。 */
export function wearableTier(realm: number, isMax: boolean): number {
  return isMax ? realm : realm + 1;
}

/**
 * 破境后能进哪些秘境（只 join 服务端的突破名录，不自行推导任何规则）。
 *
 * §22：秘境**不再有境界闸门**（"全都可突破，进去送人头都行"）—— 能不能进只取决于
 * 「要不要道具」。所以这里列的是**全部免费历练秘境**（任何境界都能突破），
 * 并明确提示特殊秘境需道具；不再按 `targetRealm` 过滤（那样会误导玩家以为要够境界）。
 */
export function enterableZoneText(breakthrough: readonly ZoneBreakthroughView[]): string {
  const names = breakthrough.filter((zone) => zone.tierKind === 'training').map((zone) => zone.name);
  return names.length > 0 ? `${names.join('、')}（特殊秘境需道具）` : '暂无（以秘境石台为准）';
}

/** 不可破境时的一句话原因；可破境返回空串。只翻译服务端字段，不含任何公式。 */
export function breakthroughBlockReason(status: RealmStatusData): string {
  if (status.isMax) return '已至封顶，暂无更高境界';
  if (status.nextCost === null) return '暂无下一境消耗数据';
  if (status.lingyun < status.nextCost) {
    return `灵韵不足：还差 ${formatCompactNumber(status.nextCost - status.lingyun)}`;
  }
  return '';
}

/** 「破境后解锁」明细（下一境名 / 可穿 T 阶 / 可进秘境）。 */
export function unlockEntries(
  status: RealmStatusData,
  breakthrough: readonly ZoneBreakthroughView[],
): KeyValueEntry[] {
  const tier = wearableTier(status.realm, status.isMax);
  return [
    {
      key: 'nextRealm',
      label: '下一境',
      value: status.isMax ? '已至封顶' : nextRealmName(status.realm, status.isMax),
    },
    { key: 'tier', label: '可穿装备阶', value: `T${formatCompactNumber(tier)}` },
    { key: 'zones', label: '可进秘境', value: enterableZoneText(breakthrough), span: 2 },
  ];
}