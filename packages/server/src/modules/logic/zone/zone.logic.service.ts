/**
 * zone 逻辑服门面（L2，依赖 combat, item, equip）—— §22 重做：
 * 秘境图鉴（只回已突破）、突破、进入（重复挑战）、离开、挂机点、在线战斗实况。
 */
import { Injectable } from '@nestjs/common';
import { ZoneService, type ZoneEncounter } from './internal/zone.service.js';
import { OnlineExploreService } from './internal/online-explore.service.js';

@Injectable()
export class ZoneLogicService {
  constructor(
    private readonly zoneService: ZoneService,
    private readonly onlineExplore: OnlineExploreService,
  ) {}

  /** 秘境图鉴：已突破列表 + 全量突破名录 + 挂机点（§22 Q4）。 */
  catalog(userId: number) {
    return this.zoneService.catalog(userId);
  }

  /** 当前在线战斗进度（未在战斗 → NO_ONLINE_BATTLE）。 */
  progress(userId: number) {
    return this.zoneService.progress(userId);
  }

  /** 进入已突破秘境的战斗（重复挑战入口，§22 Q1「可重复挑战」）。 */
  enter(userId: number, zoneCode: string) {
    return this.zoneService.enter(userId, zoneCode);
  }

  /** 突破秘境并进入在线战斗（§22：training 免费放行，special 需道具）。 */
  breakthrough(userId: number, zoneCode: string) {
    return this.zoneService.breakthrough(userId, zoneCode);
  }

  /** 手动离开当前战斗（通关会被在线 tick 自动离开）。 */
  leave(userId: number) {
    return this.zoneService.leave(userId);
  }

  /** 设置离线挂机点（需已突破且 idle_allowed）。 */
  idleTarget(userId: number, zoneCode: string) {
    return this.zoneService.idleTarget(userId, zoneCode);
  }

  /** 层数挑战（开发者工具；玩家侧推进走在线 tick）。 */
  challenge(userId: number, zoneCode?: string) {
    return this.zoneService.challenge(userId, zoneCode);
  }

  /**
   * 在线历练实况（P3.0 T5/T6）：一帧 `ZoneOnlineFrame`。
   *
   * 返回**成功信封**（即便 `online=false` / `exploring=false` 也是正常状态，不是业务失败）——
   * 面板据 `reason` 显示「已暂停 / 未在战斗」。
   */
  async online(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const frame = await this.onlineExplore.snapshot(userId);
    return { success: true, message: '获取在线历练状态成功', data: frame };
  }

  /** 页面可见性上报（P3.0 T2）：只接受 boolean 可见位，**不接收任何时长**。 */
  setVisibility(userId: number, visible: boolean): { success: boolean; message: string; data: unknown } {
    this.onlineExplore.setVisibility(userId, visible);
    return { success: true, message: visible ? '已标记页面可见' : '已标记页面不可见', data: { visible } };
  }

  /** 供 idle 域复用：是否在线战斗中（有战斗 ⇒ 离线挂机暂停，§22 Q6）。 */
  inOnlineBattle(characterId: number): Promise<boolean> {
    return this.zoneService.inOnlineBattle(characterId);
  }

  /** 供 idle 域复用：挂机点的遭遇（无挂机点 / 不可挂机返回 null）。 */
  idleEncounter(characterId: number): Promise<ZoneEncounter | null> {
    return this.zoneService.idleEncounter(characterId);
  }
}