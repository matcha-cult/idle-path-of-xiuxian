/**
 * 境界模块（P2.5 突破）
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../character/character.module.js';
import { RealmService } from './realm.service.js';

@Module({
  imports: [CharacterModule],
  providers: [RealmService],
  exports: [RealmService],
})
export class RealmModule {}
