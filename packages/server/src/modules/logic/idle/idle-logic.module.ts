/**
 * idle 逻辑服模块（M2 打样）
 *
 * 只声明本服门面与 Action；下层依赖经 import 既有子模块获得。
 */
import { Module } from '@nestjs/common';
import { IdleModule } from '../../game/idle/idle.module.js';
import { IdleAction } from './idle.action.js';
import { IdleLogicService } from './idle.logic.service.js';

@Module({
  imports: [IdleModule],
  providers: [IdleLogicService, IdleAction],
  exports: [IdleLogicService, IdleAction],
})
export class IdleLogicModule {}
