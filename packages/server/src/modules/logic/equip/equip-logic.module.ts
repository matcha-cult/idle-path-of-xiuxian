/**
 * equip 逻辑服模块（L0，依赖 item）
 */
import { Module } from '@nestjs/common';
import { ItemLogicModule } from '../item/item-logic.module.js';
import { EquipAction } from './equip.action.js';
import { EquipLogicService } from './equip.logic.service.js';

@Module({
  imports: [ItemLogicModule],
  providers: [EquipLogicService, EquipAction],
  exports: [EquipLogicService, EquipAction],
})
export class EquipLogicModule {}
