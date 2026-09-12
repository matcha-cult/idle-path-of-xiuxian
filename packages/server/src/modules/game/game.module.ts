/**
 * Game 系统基础设施模块
 *
 * 领域实现已迁到 `modules/logic/<server>/internal/`，由各逻辑服模块自行组装；
 * 本模块只提供全局基础设施：
 * - GameDatabaseService：统一 game 库连接（env: DATABASE_URL）
 * - RateLimiterService：开发接口共享限流
 * - StatModule：事件计数（@Global，供 economy/realm/combat/quest 等注入）
 */
import { Global, Module } from '@nestjs/common';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';
import { GameDatabaseService } from './game-database.service.js';
import { StatModule } from './stat/stat.module.js';

@Global()
@Module({
  imports: [StatModule],
  providers: [GameDatabaseService, RateLimiterService],
  exports: [GameDatabaseService, RateLimiterService],
})
export class GameModule {}
