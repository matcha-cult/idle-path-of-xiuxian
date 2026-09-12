/**
 * 事件计数模块（P6.2）—— @Global：供 Unit/Craft/Realm/Quest 注入
 */
import { Global, Module } from '@nestjs/common';
import { StatService } from './stat.service.js';

@Global()
@Module({
  providers: [StatService],
  exports: [StatService],
})
export class StatModule {}
