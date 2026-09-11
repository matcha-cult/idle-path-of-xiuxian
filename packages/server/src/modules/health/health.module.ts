/**
 * 健康检测模块
 *
 * - RedisService：Redis 连接（懒连接，仅探测用）
 * - HealthService：PostgreSQL + Redis 可用性检测
 * - 路由 /api/health（GET/POST，@Public 免认证）
 */
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { RedisService } from './redis.service.js';

@Module({
  controllers: [HealthController],
  providers: [HealthService, RedisService],
  exports: [HealthService],
})
export class HealthModule {}
