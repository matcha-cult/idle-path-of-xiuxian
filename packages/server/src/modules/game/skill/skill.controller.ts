/**
 * 功法 HTTP Controller（NestJS 风格）
 *
 * - GET    /api/game/skills                 功法图鉴
 * - POST   /api/game/skill/learn            修习（消耗玉简）
 * - GET    /api/game/skill/panel            面板查看
 * - PUT    /api/game/skill/panel            装槽/换装（免费）
 * - POST   /api/game/skill/enlighten        参悟（消耗灵韵）
 * - POST   /api/game/lingyun/grant          开发注入灵韵
 * - POST   /api/game/skill/jade-grant       开发发放玉简
 */
import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { UserId } from '../../../common/decorators/user-id.decorator.js';
import { SkillService } from './skill.service.js';

function toFiniteInt(value: unknown): number | undefined {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

function invalidParam(message = '参数不合法') {
  return { success: false, message, data: { code: 'INVALID_PARAM' } };
}

@Controller('game')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get('skills')
  async catalog(@UserId() userId: number) {
    return this.skillService.catalog(userId);
  }

  @Post('skill/learn')
  async learn(@UserId() userId: number, @Body() body: { skillId?: unknown }) {
    const skillId = toFiniteInt(body.skillId);
    if (skillId == null) return invalidParam('skillId 不合法');
    return this.skillService.learn(userId, skillId);
  }

  @Get('skill/panel')
  async getPanel(@UserId() userId: number) {
    return this.skillService.getPanel(userId);
  }

  @Put('skill/panel')
  async putPanel(@UserId() userId: number, @Body() body: unknown) {
    return this.skillService.putPanel(userId, body);
  }

  @Post('skill/enlighten')
  async enlighten(@UserId() userId: number, @Body() body: { skillId?: unknown }) {
    const skillId = toFiniteInt(body.skillId);
    if (skillId == null) return invalidParam('skillId 不合法');
    return this.skillService.enlighten(userId, skillId);
  }

  @Post('lingyun/grant')
  async grantLingyun(@UserId() userId: number, @Body() body: { amount?: unknown }) {
    const amount = toFiniteInt(body.amount);
    if (amount == null) return invalidParam('amount 不合法');
    return this.skillService.grantLingyun(userId, amount);
  }

  @Post('skill/jade-grant')
  async grantJade(@UserId() userId: number, @Body() body: { count?: unknown }) {
    const count = toFiniteInt(body.count);
    if (count == null) return invalidParam('count 不合法');
    return this.skillService.grantJade(userId, count);
  }
}
