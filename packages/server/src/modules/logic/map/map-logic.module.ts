/**
 * map 逻辑服模块（L2，cmd 140，settings-revision-2 §5）
 */
import { Module } from '@nestjs/common';
import { MapModule } from './internal/map-internal.module.js';
import { MapAction } from './map.action.js';
import { MapLogicService } from './map.logic.service.js';

@Module({
  imports: [MapModule],
  providers: [MapLogicService, MapAction],
  exports: [MapLogicService, MapAction],
})
export class MapLogicModule {}
