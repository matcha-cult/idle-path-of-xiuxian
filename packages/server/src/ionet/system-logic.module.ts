/**
 * system 逻辑服模块（cmd 段 1）
 *
 * HealthAction 是唯一的 system Action。任务 4 之后 Action 由框架经 `resolveAction`
 * 从容器解析，因此它必须是一个 provider —— 本模块承担该职责，与其它逻辑服模块同构。
 */
import { Module } from '@nestjs/common';
import { HealthAction } from './health.action.js';

@Module({
  providers: [HealthAction],
  exports: [HealthAction],
})
export class SystemLogicModule {}
