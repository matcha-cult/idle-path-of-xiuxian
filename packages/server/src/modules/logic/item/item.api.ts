/**
 * item 逻辑服公开类型与常量（跨服只允许引用本文件或门面 `ItemLogicService`）
 *
 * 约定（§4.4）：prop/equip/economy/combat 均不得直接 import item 的 `internal/`。
 */
export type {
  AffixEntry,
  AffixPolarity,
  AffixRow,
  AffixView,
  BaseRow,
  EquipSlotKey,
  FailResult,
  ItemRow,
  ItemView,
} from './internal/item.types.js';
export {
  EFFECT_LABELS,
  EQUIP_SLOT_KEYS,
  ITEM_SLOT_BASE,
  PERCENT_KEYS,
  RARITY_NAMES,
  fail,
} from './internal/item.types.js';
