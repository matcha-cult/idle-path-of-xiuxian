/**
 * 角色模块
 */
import { Module } from '@nestjs/common';
import { CharacterController } from './character.controller.js';
import { CharacterService } from './character.service.js';

@Module({
  controllers: [CharacterController],
  providers: [CharacterService],
  exports: [CharacterService],
})
export class CharacterModule {}
