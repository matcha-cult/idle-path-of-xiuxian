/**
 * 健康检测 HTTP Controller
 *
 * - GET  /api/health
 * - POST /api/health
 * - 免 JWT（@Public），供容器监控/c 探针访问
 * - 全健康 → 200；任一依赖不可用 → 503
 */
import { Controller, Get, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { HealthService } from './health.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async get(@Res({ passthrough: true }) res: Response) {
    const report = await this.healthService.overall();
    res.status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }

  @Post()
  async post(@Res({ passthrough: true }) res: Response) {
    const report = await this.healthService.overall();
    res.status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
