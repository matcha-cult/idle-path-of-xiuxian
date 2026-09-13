/**
 * 装备域展示纯函数（无 React / 无 store，可单测）：
 * 槽位中文名、槽位 → 候选装备筛选、阶数 vs 境界的门槛判定。
 *
 * 纪律：`slot` / `slotKey` 等协议原文只做判定键，**一律经本表映射后再上屏**；
 * 战力等公式不在面板侧计算（如需展示只复用 store 已有值）。
 */
import { EQUIP_SLOT_KEYS, REALMS, type EquipSlotKey, type ItemView } from '@idle-path/ionet-transport';
import { formatCompactNumber } from '../../../../domain/format.js';

/** 槽位 key → 中文名（双戒指分开标注）。 */
export const EQUIP_SLOT_LABELS: Readonly<Record<EquipSlotKey, string>> = {
  weapon: '武器',
  body: '衣甲',
  helmet: '头盔',
  gloves: '护手',
  boots: '战靴',
  shield: '盾牌',
  ring1: '戒指一',
  ring2: '戒指二',
  amulet: '护符',
  belt: '腰带',
};

/** 全部槽位 key（顺序即人体槽位展示顺序）。 */
export const SLOT_KEYS: readonly EquipSlotKey[] = EQUIP_SLOT_KEYS;

/** 槽位 key → 中文；未知 key 退化为中性文案，绝不回显协议原文。 */
export function slotLabel(slotKey: string): string {
  return EQUIP_SLOT_LABELS[slotKey as EquipSlotKey] ?? '未知部位';
}

/** 装备槽位 key → 物品基底 `slot`（双戒指都对应 `ring`）。 */
export function baseSlotOf(slotKey: string): string {
  return slotKey === 'ring1' || slotKey === 'ring2' ? 'ring' : slotKey;
}

/** 该槽位的候选装备：同部位 + 仍在背包（已装备的不再作为候选）。 */
export function candidatesForSlot(items: readonly ItemView[], slotKey: string): ItemView[] {
  const base = baseSlotOf(slotKey);
  return items.filter((entry) => entry.status === 'bag' && entry.slot === base);
}

/** 境界序号 → 境界名（越界/非有限数给占位）。 */
export function realmLabel(realm: number): string {
  if (!Number.isFinite(realm)) return '未知';
  return REALMS[Math.trunc(realm) - 1] ?? '未知';
}

/** 阶数门槛：可穿返回空串，否则给出「需 T{n}（当前 T{m}）」原因。 */
export function tierGateReason(tier: number, realm: number): string {
  if (!Number.isFinite(tier)) return '阶数数据缺失，无法判断可穿性';
  if (!Number.isFinite(realm)) return `境界不足：需 T${formatCompactNumber(tier)}`;
  if (tier > realm) {
    return `境界不足：需 T${formatCompactNumber(tier)}（当前 T${formatCompactNumber(realm)}）`;
  }
  return '';
}
