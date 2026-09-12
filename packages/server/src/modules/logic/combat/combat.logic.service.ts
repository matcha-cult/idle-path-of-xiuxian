/**
 * combat 逻辑服门面（L1，依赖 item, equip）
 *
 * 职责：单位实例化/击杀结算/掉落/辨宝。
 */
import { Injectable } from '@nestjs/common';
import { UnitService } from '../../game/unit/unit.service.js';

@Injectable()
export class CombatLogicService {
  constructor(private readonly unitService: UnitService) {}

  catalog(userId: number, filters: { realm?: number; camp?: string }) {
    return this.unitService.catalog(userId, filters);
  }

  dropTables(userId: number) {
    return this.unitService.dropTables(userId);
  }

  spawn(userId: number, code: string, hiddenCount?: number) {
    return this.unitService.spawn(userId, code, hiddenCount);
  }

  kill(userId: number, code: string, count?: number) {
    return this.unitService.kill(userId, code, count);
  }
}
