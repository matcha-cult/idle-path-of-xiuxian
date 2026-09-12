/**
 * 滑动窗口限流器（内存实现）
 *
 * 开发工具接口共用额度：物品生成 / 灵韵注入 / 玉简发放。
 * 单实例命中即计数，无状态依赖外部服务。
 */
import { Injectable } from '@nestjs/common';

@Injectable()
export class RateLimiterService {
  private readonly calls = new Map<number, number[]>();

  /** userId 在 60s 窗口内是否允许再调用一次（limit 为窗口上限） */
  allow(userId: number, limit: number): boolean {
    const now = Date.now();
    const history = this.calls.get(userId) ?? [];
    const fresh = history.filter((t) => now - t < 60_000);
    if (fresh.length >= limit) {
      this.calls.set(userId, fresh);
      return false;
    }
    fresh.push(now);
    this.calls.set(userId, fresh);
    return true;
  }
}
