/**
 * Correlation 门面边界（策略 ↔ A3 配对算法；协议算法本身由 A3 提供，不在前端重造）。
 */
import { describe, expect, it } from 'vitest';
import { Correlation } from '../src/client/correlation.js';

describe('Correlation · reqId 策略', () => {
  it('begin 生成唯一 reqId 且 usesReqId=true', () => {
    let n = 0;
    const correlation = new Correlation('reqId', () => `r-${++n}`);
    const a = correlation.begin();
    const b = correlation.begin();
    expect(a.reqId).toBe('r-1');
    expect(b.reqId).toBe('r-2');
    expect(correlation.usesReqId).toBe(true);
    expect(correlation.pendingCount).toBe(2);
  });

  it('精确配对：带 reqId 的响应命中对应在途（乱序亦可）', () => {
    const correlation = new Correlation('reqId', (() => {
      let n = 0;
      return () => `r-${++n}`;
    })());
    const first = correlation.begin();
    const second = correlation.begin();
    const hit = correlation.associate({ reqId: 'r-2', kind: 'response' });
    expect(hit.ok).toBe(true);
    if (hit.ok) {
      expect(hit.pending.seq).toBe(second.pending.seq);
      expect(hit.by).toBe('reqId');
    }
    expect(correlation.pendingCount).toBe(1);
    void first;
  });

  it('reqId 不匹配 → no-reqid-match，且**不**回退 FIFO（避免错配）', () => {
    const correlation = new Correlation('reqId', () => 'r-known');
    correlation.begin();
    const miss = correlation.associate({ reqId: 'r-unknown' });
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.reason).toBe('no-reqid-match');
    expect(correlation.pendingCount).toBe(1);
  });

  it('无在途请求时的响应 → no-pending', () => {
    const correlation = new Correlation('reqId');
    const miss = correlation.associate({ data: 'x' });
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.reason).toBe('no-pending');
  });

  it('重复 reqId → begin 抛错（必须唯一才能精确配对）', () => {
    const correlation = new Correlation('reqId', () => 'dup');
    correlation.begin();
    expect(() => correlation.begin()).toThrow(/duplicate in-flight reqId/);
  });

  it('drain 清空全部在途并返回', () => {
    const correlation = new Correlation('reqId', (() => {
      let n = 0;
      return () => `r-${++n}`;
    })());
    correlation.begin();
    correlation.begin();
    const drained = correlation.drain();
    expect(drained).toHaveLength(2);
    expect(correlation.pendingCount).toBe(0);
  });
});

describe('Correlation · serial 策略', () => {
  it('usesReqId=false 且 begin 不产生 reqId', () => {
    const correlation = new Correlation('serial');
    const begun = correlation.begin();
    expect(begun.reqId).toBeUndefined();
    expect(correlation.usesReqId).toBe(false);
  });

  it('无 reqId 的响应按最早在途 FIFO 配对（旧协议兼容）', () => {
    const correlation = new Correlation('serial');
    const first = correlation.begin();
    correlation.begin();
    const hit = correlation.associate({ data: 'legacy' });
    expect(hit.ok).toBe(true);
    if (hit.ok) {
      expect(hit.pending.seq).toBe(first.pending.seq);
      expect(hit.by).toBe('fifo');
    }
    expect(correlation.pendingCount).toBe(1);
  });
});
