/**
 * ionet Action cmd 分段规划
 *
 * 与 ionet-ts 官方 demo 风格一致：
 * - demo（HALL_CMD）：cmd 从 1 起，`HALL_CMD.cmd = 1`；
 * - demo-mmorpg（LOGIN/USER/ITEM/IDLE）：每个业务域一个 cmd 段，段内 subCmd 从 1 起。
 *
 * 本仓库约定：
 * - 每段宽度 10（段内 subCmd 1~9 可用，0 保留），避免与相邻段混淆、便于扩容；
 * - 仅在 ionet 侧新增 Action 时扩展对应段，且不得跨段使用未登记的 cmd。
 */
export const CMD_SEGMENTS = {
  /** 系统/示例（同 demo HALL=1）——HealthAction 所在段 */
  system: 1,
  /** 用户认证（Auth，当前走 NestJS REST，预留 ionet 通道） */
  auth: 10,
  /** 角色（Character，当前走 NestJS REST，预留 ionet 通道） */
  character: 20,
  /** 物品与词缀（P1） */
  item: 30,
  /** 功法（P2） */
  skill: 40,
  /** 通货经济（P3） */
  economy: 50,
  /** 放置循环（P4） */
  idle: 60,
  /** 剧情/秘境（P5） */
  story: 70,
  /** 混沌争夺战（P6） */
  chaos: 80,
} as const;

/** 系统/示例段：HealthAction */
export const SYSTEM_CMD = {
  cmd: CMD_SEGMENTS.system,
  ping: 1,
} as const;