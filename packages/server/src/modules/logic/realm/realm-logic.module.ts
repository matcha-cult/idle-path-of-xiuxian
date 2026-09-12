/**
 * realm 逻辑服模块（L1，依赖 character, prop）
 */
import { Module } from '@nestjs/common';
import { RealmModule } from '../../game/realm/realm.module.js';
import { RealmAction } from './realm.action.js';
import { RealmLogicService } from './realm.logic.service.js';

@Module({
  imports: [RealmModule],
  providers: [RealmLogicService, RealmAction],
  exports: [RealmLogicService, RealmAction],
})
export class RealmLogicModule {}
