/**
 * skill 逻辑服模块（L0，依赖 character）
 */
import { Module } from '@nestjs/common';
import { SkillModule } from './internal/skill-internal.module.js';
import { SkillAction } from './skill.action.js';
import { SkillLogicService } from './skill.logic.service.js';

@Module({
  imports: [SkillModule],
  providers: [SkillLogicService, SkillAction],
  exports: [SkillLogicService, SkillAction],
})
export class SkillLogicModule {}
