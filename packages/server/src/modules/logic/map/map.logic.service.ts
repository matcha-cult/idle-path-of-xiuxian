/**
 * map 逻辑服门面（settings-revision-2 §5；§22 修订）
 *
 * 约定（§4.4）：每个逻辑服只导出一个门面服务 `XxxLogicService`；
 * 本服 Action 只依赖本门面。
 *
 * §22：**跨服调用已全部移除** —— 秘境与地图彻底解耦后，zone / idle 域不再需要
 * `onZoneFloorPassed`（置位地图节点 idle_unlocked）、`zoneIdleGate`（离线闸门过渡分支）、
 * `secretRealmNodeView`（在线历练白名单）。本门面只剩三个玩家动作。
 */
import { Injectable } from '@nestjs/common';
import { MapService, type MapActionResult } from './internal/map.service.js';

@Injectable()
export class MapLogicService {
  constructor(private readonly mapService: MapService) {}

  /** 地图线路图（只含已发现节点） */
  list(userId: number): Promise<MapActionResult> {
    return this.mapService.panel(userId);
  }

  /** 跑图：移动到目标节点 */
  enter(userId: number, nodeCode: string): Promise<MapActionResult> {
    return this.mapService.enter(userId, nodeCode);
  }

  /** 传送：直达已点亮的传送点节点 */
  waypoint(userId: number, nodeCode: string): Promise<MapActionResult> {
    return this.mapService.waypoint(userId, nodeCode);
  }
}