/**
 * 角色 HTTP Controller（NestJS 风格）
 *
 * - GET  /api/character/check
 * - POST /api/character/create
 * - GET  /api/character/info
 *
 * 全部需要 JWT 认证（全局 Guard 默认拦截）。
 */
import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserId } from '../../common/decorators/user-id.decorator.js';
import { CharacterService } from './character.service.js';

interface CreateCharacterBody {
  nickname?: string;
  gender?: string;
}

@Controller('character')
export class CharacterController {
  constructor(private readonly characterService: CharacterService) {}

  @Get('check')
  async check(@UserId() userId: number) {
    return this.characterService.check(userId);
  }

  @Post('create')
  async create(@UserId() userId: number, @Body() body: CreateCharacterBody) {
    const nickname = typeof body.nickname === 'string' ? body.nickname : '';
    const gender = typeof body.gender === 'string' ? body.gender : '';
    if (!nickname || !gender) {
      return { success: false, message: '昵称和性别不能为空' };
    }
    if (gender !== 'male' && gender !== 'female') {
      return { success: false, message: '性别参数错误' };
    }
    return this.characterService.create(userId, nickname, gender as 'male' | 'female');
  }

  @Get('info')
  async info(@UserId() userId: number) {
    return this.characterService.info(userId);
  }
}
