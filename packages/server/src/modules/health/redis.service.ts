/**
 * Redis 连接服务（仅用于健康检测）
 *
 * - 连接串走 env：REDIS_URL（默认 redis://localhost:6379）
 * - 懒连接 + 短超时，保证健康探针快速失败快速返回
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis(REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    });
  }

  /** 探测：已连接则 PING，未连接先 connect 再 PING；失败抛错 */
  async ping(): Promise<string> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
    if (this.client.status !== 'ready') {
      throw new Error(`redis unavailable (status: ${this.client.status})`);
    }
    return this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.client.disconnect();
    } catch {
      // 忽略销毁期异常
    }
  }
}
