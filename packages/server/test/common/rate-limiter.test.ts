import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiterService } from '../../src/common/services/rate-limiter.service.js';

describe('RateLimiterService 边界', () => {
  test('limit=0 时任何调用都拒绝', () => {
    mock.timers.enable({ apis: ['Date'] });
    try {
      const limiter = new RateLimiterService();
      assert.equal(limiter.allow(1, 0), false);
    } finally {
      mock.timers.reset();
    }
  });

  test('窗口内恰好用满 limit，下一次拒绝', () => {
    mock.timers.enable({ apis: ['Date'] });
    try {
      const limiter = new RateLimiterService();
      assert.equal(limiter.allow(7, 2), true);
      assert.equal(limiter.allow(7, 2), true);
      assert.equal(limiter.allow(7, 2), false);
    } finally {
      mock.timers.reset();
    }
  });

  test('60s 边界：59.999s 仍计数，60s 后释放', () => {
    mock.timers.enable({ apis: ['Date'] });
    try {
      const limiter = new RateLimiterService();
      assert.equal(limiter.allow(9, 1), true);
      mock.timers.tick(59_999);
      assert.equal(limiter.allow(9, 1), false);
      mock.timers.tick(1); // 累计 60_000，窗口外
      assert.equal(limiter.allow(9, 1), true);
    } finally {
      mock.timers.reset();
    }
  });

  test('不同 userId 互不影响', () => {
    mock.timers.enable({ apis: ['Date'] });
    try {
      const limiter = new RateLimiterService();
      assert.equal(limiter.allow(1, 1), true);
      assert.equal(limiter.allow(1, 1), false);
      assert.equal(limiter.allow(2, 1), true);
    } finally {
      mock.timers.reset();
    }
  });
});
