/**
 * `map-lab` 的**入口开关**（纯前端，后端与协议零参与）。
 *
 * 为什么要单独一个入口：用户 2026-09-15 明确要求「**本次实践必须新开文件，不能在存量临时方案中
 * 直接进行修改，交付前可以在前端使用新入口进行测试，保留旧页面入口**」。
 * 因此旧的 `MapPanel` / `GraphCanvas` 一行不动，新链路只在这个参数打开时才挂载：
 *
 * - `?mapLab=1` → 新入口（canvas 混合渲染 + 可交互对象 + 交互解锁传送）；
 * - 无参数 / 非法值 → **旧入口**（`GameShellPage`），行为与今天完全一致。
 *
 * `search` 是**显式入参**（不在这里读 `location`），于是这条规则可以不依赖浏览器单测
 * —— 与既有的 `debug-flags.ts` 同一手法。
 */

/** URL 参数名（正式排查时口头传达同一个名字）。 */
export const MAP_LAB_PARAM = 'mapLab';

/**
 * 是否显示**开发者帧率表**（`?mapLabPerf=1`）。
 *
 * 用途：让「手感」在真机上可读 —— 拖动 / 缩放时直接看到掉帧数与最差帧，而不是靠"感觉卡"。
 * 默认**关**：验收页面不该被调试读数占用（与 `?mapGrid=1` 同一取舍）。
 */
export const MAP_LAB_PERF_PARAM = 'mapLabPerf';

export function shouldShowFrameMeter(search: string): boolean {
  if (typeof search !== 'string') return false;
  try {
    return new URLSearchParams(search).get(MAP_LAB_PERF_PARAM) === '1';
  } catch {
    return false;
  }
}

/**
 * 是否走新入口。
 *
 * 边界：`search` 带不带 `?` 都接受；重复参数取**第一个**（与 `URLSearchParams.get` 一致）；
 * 只认完整值 `'1'`（`0` / `x` / 空串 / `true` 一律回退旧入口）；非法 `search` 不抛错。
 */
export function shouldUseMapLab(search: string): boolean {
  if (typeof search !== 'string') return false;
  try {
    return new URLSearchParams(search).get(MAP_LAB_PARAM) === '1';
  } catch {
    return false;
  }
}
