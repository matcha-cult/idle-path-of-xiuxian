/**
 * realm 逻辑服门面（L1，依赖 character, prop）
 */
import { Injectable } from '@nestjs/common';
import { RealmService } from '../../game/realm/realm.service.js';

@Injectable()
export class RealmLogicService {
  constructor(private readonly realmService: RealmService) {}

  status(userId: number) {
    return this.realmService.status(userId);
  }

  breakthrough(userId: number) {
    return this.realmService.breakthrough(userId);
  }
}
