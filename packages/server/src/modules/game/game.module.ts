/**
 * Game 系统根模块
 *
 * - GameDatabaseService：统一库连接（env: DATABASE_URL，与用户系统同库 idle_game）
 * - ItemModule：物品与词缀（P1）
 * - UnitModule：单位系统与掉落结算（P4）
 */
import { Global, Module } from '@nestjs/common';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';
import { GameDatabaseService } from './game-database.service.js';
import { ItemModule } from './item/item.module.js';
import { StatModule } from './stat/stat.module.js';

@Global()
@Module({
  imports: [ItemModule, StatModule],
  providers: [GameDatabaseService, RateLimiterService],
  exports: [GameDatabaseService, RateLimiterService],
})
export class GameModule {}
