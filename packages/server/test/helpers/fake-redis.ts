/**
 * 测试用假 Redis：可切换 PONG / 异常 / 挂起（用于超时分支）。
 */
export class FakeRedis {
  mode: 'pong' | 'wrong' | 'throw' | 'hang' = 'pong';
  pingCount = 0;

  async ping(): Promise<string> {
    this.pingCount += 1;
    if (this.mode === 'throw') throw new Error('redis down');
    if (this.mode === 'wrong') return 'NOPE';
    if (this.mode === 'hang') return new Promise<string>(() => undefined);
    return 'PONG';
  }
}
