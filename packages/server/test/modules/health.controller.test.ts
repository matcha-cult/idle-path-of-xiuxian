import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HealthController } from '../../src/modules/health/health.controller.js';
import { stub } from '../helpers/stub.js';

function makeController(status: 'ok' | 'degraded') {
  const report = { status, timestamp: new Date().toISOString(), uptimeSeconds: 1, checks: {} };
  const service = { overall: stub(async () => report) };
  const controller = new HealthController(service as never);
  const calls: number[] = [];
  const res = { status: (code: number) => { calls.push(code); return res; } };
  return { controller, res: res as never, calls, report };
}

describe('HealthController 边界', () => {
  test('ok -> 200', async () => {
    const { controller, res, calls, report } = makeController('ok');
    assert.deepEqual(await controller.get(res), report);
    assert.deepEqual(calls, [200]);
  });
  test('degraded -> 503', async () => {
    const { controller, res, calls } = makeController('degraded');
    await controller.get(res);
    assert.deepEqual(calls, [503]);
  });
  test('POST 与 GET 行为一致', async () => {
    const { controller, res, calls } = makeController('degraded');
    await controller.post(res);
    assert.deepEqual(calls, [503]);
  });
});
