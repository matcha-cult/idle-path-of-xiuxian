/**
 * 健康检测服务
 *
 * 用于生产部署容器监控（Docker HEALTHCHECK / K8s probes）：
 * - 检测 PostgreSQL（SELECT 1）与 Redis（PING）可用性
 * - 全 up → status 'ok'（HTTP 200）；任一 down → 'degraded'（HTTP 503）
 * - 单检超时 2s，保证探针快速失败
 */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from './redis.service.js';

const CHECK_TIMEOUT_MS = 2000;

export interface CheckResult {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: CheckResult;
    redis: CheckResult;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`check timeout after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async checkDatabase(): Promise<CheckResult> {
    const started = Date.now();
    try {
      await this.withTimeout(this.database.query('SELECT 1'), CHECK_TIMEOUT_MS);
      return { status: 'up', latencyMs: Date.now() - started };
    } catch (error) {
      return { status: 'down', latencyMs: Date.now() - started, error: String((error as Error).message) };
    }
  }

  async checkRedis(): Promise<CheckResult> {
    const started = Date.now();
    try {
      const pong = await this.withTimeout(this.redisService.ping(), CHECK_TIMEOUT_MS);
      if (pong !== 'PONG') {
        return { status: 'down', latencyMs: Date.now() - started, error: `unexpected ping response: ${pong}` };
      }
      return { status: 'up', latencyMs: Date.now() - started };
    } catch (error) {
      return { status: 'down', latencyMs: Date.now() - started, error: String((error as Error).message) };
    }
  }

  async overall(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    return {
      status: database.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      checks: { database, redis },
    };
  }
}
