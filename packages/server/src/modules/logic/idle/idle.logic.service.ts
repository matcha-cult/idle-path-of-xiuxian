/**
 * idle 逻辑服门面（M2 打样）
 *
 * 约定（§4.4）：每个逻辑服只导出一个门面服务 `XxxLogicService`；
 * 本服 Action 只依赖本门面，不直接依赖下层服务细节。
 *
 * 迁移期实现委托给既有 `game/idle/idle.service`（同服），
 * M3 会把实现整体搬入 `modules/logic/idle/`。
 */
import { Injectable } from '@nestjs/common';
import { IdleService } from '../../game/idle/idle.service.js';

@Injectable()
export class IdleLogicService {
  constructor(private readonly idleService: IdleService) {}

  status(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    return this.idleService.status(userId);
  }

  settle(
    userId: number,
    unitCode?: string,
    hours?: number,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    return this.idleService.settle(userId, unitCode, hours);
  }
}
