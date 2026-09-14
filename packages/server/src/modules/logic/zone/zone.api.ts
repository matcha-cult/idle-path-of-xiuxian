/**
 * zone 逻辑服**公开类型**（跨服只允许引用本文件或门面 `ZoneLogicService`）。
 *
 * 与 combat/item/quest 的 `*.api.ts` 同一模式：内部实现细节留在 `internal/`，
 * 跨服要用的形状在这里重新导出，`check:deps` 的「跨服直连 internal」告警因此不会出现。
 */
export type { ZoneIdleFloor, ZoneIdlePlan } from './internal/zone.types.js';
