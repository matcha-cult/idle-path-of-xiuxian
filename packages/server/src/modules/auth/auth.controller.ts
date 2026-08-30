/**
 * 用户认证 HTTP Controller（NestJS 风格）
 *
 * - POST /api/auth/register
 * - POST /api/auth/login
 */
import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';

interface AuthBody {
  username?: string;
  password?: string;
}

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: AuthBody) {
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';
    return this.authService.register(username, password);
  }

  @Post('login')
  async login(@Body() body: AuthBody) {
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';
    return this.authService.login(username, password);
  }
}
