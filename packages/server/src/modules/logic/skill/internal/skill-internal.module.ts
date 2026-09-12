/**
 * 功法模块（SkillModule）
 *
 * 依赖：GameDatabaseService（game 库）、DatabaseService（用户库：玉简/灵韵原子扣减）、CharacterService
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../../character/character.module.js';
import { SkillService } from './skill.service.js';

@Module({
  imports: [CharacterModule],
  providers: [SkillService],
  exports: [SkillService],
})
export class SkillModule {}
