/**
 * zone 逻辑服门面（L2，依赖 combat, item, equip）
 */
import { Injectable } from '@nestjs/common';
import { ZoneService } from './internal/zone.service.js';
import { OnlineExploreService } from './internal/online-explore.service.js';

@Injectable()
export class ZoneLogicService {
  constructor(
    private readonly zoneService: ZoneService,
    private readonly onlineExplore: OnlineExploreService,
  ) {}

  catalog(userId: number) {
    return this.zoneService.catalog(userId);
  }

  progress(userId: number) {
    return this.zoneService.progress(userId);
  }

  enter(userId: number, zoneCode: string) {
    return this.zoneService.enter(userId, zoneCode);
  }

  challenge(userId: number, zoneCode?: string) {
    return this.zoneService.challenge(userId, zoneCode);
  }

  /**
   * 在线历练实况（P3.0 T5/T6）：一帧 `ZoneOnlineFrame`。
   *
   * 返回**成功信封**（即便 `online=false` / `exploring=false` 也是正常状态，不是业务失败）——
   * 面板据 `reason` 显示「已暂停 / 未进入秘境 / 不在秘境峰」。
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

  /** 供 idle 复用：当前秘境/当前层遭遇的单位（无可用秘境返回 null） */
  encounterForCharacter(characterId: number, realm: number) {
    return this.zoneService.encounterForCharacter(characterId, realm);
  }
}
