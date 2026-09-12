/**
 * 境界模块（P2.5 突破）
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../character/character.module.js';
import { RealmController } from './realm.controller.js';
import { RealmService } from './realm.service.js';

@Module({
  imports: [CharacterModule],
  controllers: [RealmController],
  providers: [RealmService],
  exports: [RealmService],
})
export class RealmModule {}
