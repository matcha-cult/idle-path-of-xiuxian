/**
 * `map-points` —— 点位这套东西的**统一入口**（barrel）。调用方仍然 `from './map-points.js'`。
 *
 * 为什么拆三个文件：web 的红线是「单文件 ≤200 行」，而这个模块要同时装下
 * **类型契约**、**数据表**（用户会经常改的那张表）与**派生 + 滑杆口径**三件事。
 * 拆开之后每件事各一个文件、依赖方向单向（types ← catalog ← query），
 * 于是「改地图布局」只需要打开 `map-catalog.ts` 一个文件。
 */
export * from './map-types.js';
export * from './map-catalog.js';
export * from './map-point-query.js';
