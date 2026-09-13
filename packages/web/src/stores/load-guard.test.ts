/**
 * LoadGuard 边界：令牌递增、只有最新令牌有效、过期令牌在多次加载后失效。
 */
import { describe, expect, it } from 'vitest';
import { LoadGuard } from './load-guard.js';

describe('LoadGuard', () => {
  it('首个令牌即当前令牌', () => {
    const guard = new LoadGuard();
    const token = guard.next();
    expect(token).toBe(1);
    expect(guard.isCurrent(token)).toBe(true);
    expect(guard.current).toBe(1);
  });

  it('新加载发起后，旧令牌立即失效（先发后到被丢弃）', () => {
    const guard = new LoadGuard();
    const first = guard.next();
    const second = guard.next();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  it('连续多次加载只有最后一次有效', () => {
    const guard = new LoadGuard();
    const tokens = [guard.next(), guard.next(), guard.next(), guard.next()];
    expect(tokens.filter((t) => guard.isCurrent(t))).toEqual([tokens[3]]);
  });

  it('未使用过的令牌（0 / 负数）永不有效', () => {
    const guard = new LoadGuard();
    guard.next();
    expect(guard.isCurrent(0)).toBe(false);
    expect(guard.isCurrent(-1)).toBe(false);
  });
});
