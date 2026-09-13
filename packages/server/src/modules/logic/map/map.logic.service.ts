/**
 * map 逻辑服门面（settings-revision-2 §5）
 *
 * 约定（§4.4）：每个逻辑服只导出一个门面服务 `XxxLogicService`；
 * 本服 Action 只依赖本门面；跨服调用（zone 的层数推进、idle 的离线闸门）
 * 也只允许经本门面进入。
 */
import { Injectable } from '@nestjs/common';
import type {
  ZoneFloorAdvancedEvent,
  ZoneIdleGate,
  ZoneIdleUnlockResult,
} from './map.api.js';
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

  /** 供 zone 复用：层数推进到 Boss 层时置位秘境节点 `idle_unlocked`（§5.5 / D2） */
  onZoneFloorPassed(
    characterId: number,
    event: ZoneFloorAdvancedEvent,
  ): Promise<ZoneIdleUnlockResult> {
    return this.mapService.onZoneFloorPassed(characterId, event);
  }

  /** 供 idle 复用：离线挂机闸门判定（过渡规则见 `map.service.ts` 的 `zoneIdleGate`） */
  zoneIdleGate(characterId: number, zoneCode: string): Promise<ZoneIdleGate> {
    return this.mapService.zoneIdleGate(characterId, zoneCode);
  }

  /**
   * 供 zone 复用（P3.0 T4）：该秘境是否是「地图上的历练秘境峰」（附带该角色的解锁态）。
   * 返回 `null` 表示没挂在任何 `secret_realm` 地图节点上（遗留秘境 / 未归属）。
   */
  secretRealmNodeView(
    characterId: number,
    zoneCode: string,
  ): Promise<{ nodeCode: string; nodeName: string; idleUnlocked: boolean } | null> {
    return this.mapService.secretRealmNodeView(characterId, zoneCode);
  }
}
