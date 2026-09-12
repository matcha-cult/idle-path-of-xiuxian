/**
 * combat 逻辑服模块（L1，依赖 item, equip）
 */
import { Module } from '@nestjs/common';
import { UnitModule } from '../../game/unit/unit.module.js';
import { CombatAction } from './combat.action.js';
import { CombatLogicService } from './combat.logic.service.js';

@Module({
  imports: [UnitModule],
  providers: [CombatLogicService, CombatAction],
  exports: [CombatLogicService, CombatAction],
})
export class CombatLogicModule {}
