/**
 * skill 逻辑服门面（L0，依赖 character）
 *
 * 职责：功法修习/装配/参悟与开发注入门禁。
 */
import { Injectable } from '@nestjs/common';
import { SkillService } from '../../game/skill/skill.service.js';

@Injectable()
export class SkillLogicService {
  constructor(private readonly skillService: SkillService) {}

  catalog(userId: number) {
    return this.skillService.catalog(userId);
  }

  learn(userId: number, skillId: number) {
    return this.skillService.learn(userId, skillId);
  }

  getPanel(userId: number) {
    return this.skillService.getPanel(userId);
  }

  putPanel(userId: number, payload: unknown) {
    return this.skillService.putPanel(userId, payload);
  }

  enlighten(userId: number, skillId: number) {
    return this.skillService.enlighten(userId, skillId);
  }

  grantLingyun(userId: number, amount: number) {
    return this.skillService.grantLingyun(userId, amount);
  }

  grantJade(userId: number, count: number) {
    return this.skillService.grantJade(userId, count);
  }
}
