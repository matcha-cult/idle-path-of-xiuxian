/**
 * zone 逻辑服模块（L2，依赖 combat, item, equip）
 */
import { Module } from '@nestjs/common';
import { ZoneModule } from '../../game/zone/zone.module.js';
import { ZoneAction } from './zone.action.js';
import { ZoneLogicService } from './zone.logic.service.js';

@Module({
  imports: [ZoneModule],
  providers: [ZoneLogicService, ZoneAction],
  exports: [ZoneLogicService, ZoneAction],
})
export class ZoneLogicModule {}
