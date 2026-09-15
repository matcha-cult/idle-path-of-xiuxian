/**
 * `map-stage` 的**入口开关**（纯前端，后端与协议零参与）。
 *
 * 与 `map-lab/entry-flag.ts` 同一手法：`search` 是**显式入参**（不在这里读 `location`），
 * 于是这条规则可以脱离浏览器单测 —— 与既有的 `debug-flags.ts` 一致。
 *
 * - `?mapStage=1` → 地图重做舞台（纯 canvas，第一步：网格 + 坐标）；
 * - 无参数 / 非法值 → 旧入口（`GameShellPage`），行为与今天完全一致；
 * - `?mapLab=1` 的上一轮原型**保留**（用户 2026-09-15 选择「等新组件跑通后再删」），
 *   两个参数可以共存、直接改地址栏来回对比手感。
 */

/** URL 参数名（正式排查时口头传达同一个名字）。 */
export const MAP_STAGE_PARAM = 'mapStage';

/**
 * 是否走地图重做舞台。
 *
 * 边界：`search` 带不带 `?` 都接受（`URLSearchParams` 两种都吃）；重复参数取**第一个**；
 * 只认完整值 `'1'`（`0` / `x` / 空串 / `true` 一律回退旧入口）；非法 `search` 不抛错。
 */
export function shouldUseMapStage(search: string): boolean {
  if (typeof search !== 'string') return false;
  try {
    return new URLSearchParams(search).get(MAP_STAGE_PARAM) === '1';
  } catch {
    return false;
  }
}
