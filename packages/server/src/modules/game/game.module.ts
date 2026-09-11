/**
 * Game 系统根模块
 *
 * - GameDatabaseService：统一库连接（env: DATABASE_URL，与用户系统同库 idle_game）
 * - ItemModule：物品与词缀（P1）
 * - 后续：UnitModule（P4）、QuestModule（P6）、CurrencyModule（P3）
 */
import { Global, Module } from '@nestjs/common';
import { GameDatabaseService } from './game-database.service.js';
import { ItemModule } from './item/item.module.js';

@Global()
@Module({
  imports: [ItemModule],
  providers: [GameDatabaseService],
  exports: [GameDatabaseService],
})
export class GameModule {}
