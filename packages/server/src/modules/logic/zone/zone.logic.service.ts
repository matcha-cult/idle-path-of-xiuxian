/**
 * zone 逻辑服门面（L2，依赖 combat, item, equip）
 */
import { Injectable } from '@nestjs/common';
import { ZoneService } from '../../game/zone/zone.service.js';

@Injectable()
export class ZoneLogicService {
  constructor(private readonly zoneService: ZoneService) {}

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
}
