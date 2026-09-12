/**
 * combat 逻辑服公开类型与常量（跨服只允许引用本文件或门面 `CombatLogicService`）
 */
export type { SettlementData, SettleResult } from './internal/unit.service.js';
export { UNIT_CAMPS } from './internal/unit.types.js';
export { type FailResult, fail } from '../../../common/kernel/result.js';
