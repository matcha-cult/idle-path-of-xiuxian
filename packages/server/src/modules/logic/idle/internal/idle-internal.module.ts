/**
 * 离线收益模块（P4.2）
 *
 * 依赖 UnitModule（复用 settleKills）、CharacterModule（角色解析）
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../../character/character.module.js';
import { UnitModule } from '../../../game/unit/unit.module.js';
import { ZoneModule } from '../../../game/zone/zone.module.js';
import { IdleService } from './idle.service.js';

@Module({
  imports: [CharacterModule, UnitModule, ZoneModule],
  providers: [IdleService],
  exports: [IdleService],
})
export class IdleModule {}
