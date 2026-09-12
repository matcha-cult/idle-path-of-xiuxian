/**
 * Game 系统根模块
 *
 * - GameDatabaseService：统一库连接（env: DATABASE_URL，与用户系统同库 idle_game）
 * - ItemModule：物品与词缀（P1）
 * - 后续：UnitModule（P4）、QuestModule（P6）、CurrencyModule（P3）
 */
import { Global, Module } from '@nestjs/common';
import { RateLimiterService } from '../../common/services/rate-limiter.service.js';
import { GameDatabaseService } from './game-database.service.js';
import { CurrencyModule } from './currency/currency.module.js';
import { ItemModule } from './item/item.module.js';
import { RealmModule } from './realm/realm.module.js';
import { SkillModule } from './skill/skill.module.js';

@Global()
@Module({
  imports: [ItemModule, SkillModule, RealmModule, CurrencyModule],
  providers: [GameDatabaseService, RateLimiterService],
  exports: [GameDatabaseService, RateLimiterService],
})
export class GameModule {}
