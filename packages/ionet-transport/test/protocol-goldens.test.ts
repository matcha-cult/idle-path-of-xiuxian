/**
 * T1 验收 · 协议金样对齐（A3 `ENVELOPE_GOLDENS`，与 A1 主套件同源）。
 *
 * 目的：前端出站请求帧与 A3 金样**逐字节一致**，入站帧按 A3 `classifyFrame` 分流，
 * 业务/传输判定与金样的 `absent` 约束一致 —— 证明前端没有第二份协议真相。
 */
import { describe, expect, it } from 'vitest';
import { ENVELOPE_GOLDENS } from '@nbb-ionet/client-protocol/testing';
import { classifyFrame, envelopeCodec } from '@nbb-ionet/client-protocol';
import { IonetClient } from '../src/client/ionet-client.js';
import { assertResponseOk, TransportError } from '../src/client/errors.js';
import { createHarness, waitFor } from './helpers/harness.js';

const requestGolden = ENVELOPE_GOLDENS.find((g) => g.id === 'request-full');
const responseGoldens = ENVELOPE_GOLDENS.filter((g) => g.id.startsWith('response-'));
const notificationGoldens = ENVELOPE_GOLDENS.filter((g) => (g.decoded as { kind?: unknown }).kind === 'notification');

describe('金样自洽（与 A3 约定一致）', () => {
  it('每个金样 decode→encode 逐字节恒等（未知字段不丢）', () => {
    for (const golden of ENVELOPE_GOLDENS) {
      const decoded = envelopeCodec.decode(golden.wire);
      expect(envelopeCodec.encode(decoded), golden.id).toBe(golden.wire);
    }
  });

  it('absent 键在解码后确实不存在', () => {
    for (const golden of ENVELOPE_GOLDENS) {
      const decoded = envelopeCodec.decode(golden.wire);
      for (const key of golden.absent ?? []) {
        expect(Object.prototype.hasOwnProperty.call(decoded, key), `${golden.id}:${key}`).toBe(false);
      }
    }
  });
});

describe('出站请求帧与金样逐字节一致（§3+§4.1）', () => {
  it('全字段请求（含 reqId）与 request-full 金样字节相同', async () => {
    expect(requestGolden).toBeDefined();
    const harness = createHarness(() => null);
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: { enabled: false },
      reqIdGenerator: () => 'r-full',
    });
    await client.connect();
    void client
      .requestEnvelope(410, 1, 'full', { headers: { h: '1' }, traceId: 't-1' })
      .catch(() => undefined);
    await waitFor(() => harness.adapter().sent.length > 0, { label: '请求已发出' });
    expect(harness.adapter().sent[0]).toBe(requestGolden?.wire);
    client.close();
  });

  it('不带 reqId 的串行模式请求不含 reqId 键（§12.1 旧协议兼容）', async () => {
    const harness = createHarness(() => null);
    const client = new IonetClient({
      url: 'ws://test/ws',
      adapterFactory: harness.factory,
      heartbeat: false,
      reconnect: { enabled: false },
      correlation: 'serial',
    });
    await client.connect();
    void client.requestEnvelope(30, 1, { page: 1 }).catch(() => undefined);
    await waitFor(() => harness.adapter().sent.length > 0, { label: '请求已发出' });
    const sent = harness.adapter().sentFrames()[0];
    expect(sent).toEqual({ cmd: 30, subCmd: 1, data: { page: 1 } });
    expect(Object.prototype.hasOwnProperty.call(sent, 'reqId')).toBe(false);
    client.close();
  });
});

describe('入站帧按金样分流（§4/§5）', () => {
  it('response 金样 → classifyFrame=response', () => {
    for (const golden of responseGoldens) {
      expect(classifyFrame(envelopeCodec.decode(golden.wire)), golden.id).toBe('response');
    }
  });

  it('notification 金样 → classifyFrame=notification，且响应配对不会误吞', () => {
    for (const golden of notificationGoldens) {
      expect(classifyFrame(envelopeCodec.decode(golden.wire)), golden.id).toBe('notification');
    }
  });

  it('旧裸透传推送（无 kind，§12.4）A3 归入 response —— 前端按 A3 语义处理，不自造判别', () => {
    const legacy = ENVELOPE_GOLDENS.find((g) => g.id === 'passthrough-legacy-push');
    expect(legacy).toBeDefined();
    expect(classifyFrame(envelopeCodec.decode(legacy?.wire ?? ''))).toBe('response');
  });
});

describe('响应信封判定与金样一致（§4/§8/§12）', () => {
  it('旧协议成功响应 → 通过', () => {
    const golden = responseGoldens.find((g) => g.id === 'response-legacy-success');
    expect(() => assertResponseOk(envelopeCodec.decode(golden?.wire ?? ''))).not.toThrow();
  });

  it.each(['response-legacy-error', 'response-new-error'])('%s → TransportError(404)', (id) => {
    const golden = responseGoldens.find((g) => g.id === id);
    const error = (() => {
      try {
        assertResponseOk(envelopeCodec.decode(golden?.wire ?? ''));
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).errorCode).toBe(404);
  });
});
