/**
 * 角色模块
 */
import { Module } from '@nestjs/common';
import { CharacterController } from './character.controller.js';
import { CharacterService } from './character.service.js';
import { PlayerPowerService } from './player-power.service.js';

@Module({
  controllers: [CharacterController],
  providers: [CharacterService, PlayerPowerService],
  exports: [CharacterService, PlayerPowerService],
})
export class CharacterModule {}
