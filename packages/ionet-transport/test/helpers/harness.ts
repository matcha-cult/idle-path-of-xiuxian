/**
 * 测试夹具：每个（重）连都新建一个 FakeSocketAdapter，并挂上 MemoryIonetServer 自动应答。
 * 用于断言「重连是否新建连接」「每次 connect 携带的 token」等。
 */
import { FakeSocketAdapter, type FakeSocketOptions } from '../../src/testing/fake-socket-adapter.js';
import { MemoryIonetServer, type MockHandler } from '../../src/testing/memory-ionet-server.js';

export interface Harness {
  factory: () => FakeSocketAdapter;
  readonly adapters: FakeSocketAdapter[];
  readonly servers: MemoryIonetServer[];
  /** 最近一次创建的适配器（当前连接）。 */
  adapter(): FakeSocketAdapter;
  /** 最近一次创建的适配器对应的 mock 服务端。 */
  server(): MemoryIonetServer;
  /** 全部适配器上出现过的握手 URL（按连接次序）。 */
  handshakeUrls(): string[];
}

export function createHarness(
  handler: MockHandler,
  adapterOptions: FakeSocketOptions = {},
  serverOptions: { echoReqId?: boolean } = {},
): Harness {
  const adapters: FakeSocketAdapter[] = [];
  const servers: MemoryIonetServer[] = [];
  const factory = (): FakeSocketAdapter => {
    const adapter = new FakeSocketAdapter(adapterOptions);
    const server = new MemoryIonetServer(adapter, { handler, echoReqId: serverOptions.echoReqId });
    server.start();
    adapters.push(adapter);
    servers.push(server);
    return adapter;
  };
  return {
    factory,
    adapters,
    servers,
    adapter: () => {
      const last = adapters[adapters.length - 1];
      if (last === undefined) throw new Error('harness: 尚无适配器');
      return last;
    },
    server: () => {
      const last = servers[servers.length - 1];
      if (last === undefined) throw new Error('harness: 尚无服务端');
      return last;
    },
    handshakeUrls: () => adapters.map((a) => a.url ?? ''),
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 轮询直到条件成立或超时（真实计时器场景下的稳健等待）。 */
export async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 500, intervalMs = 5, label = 'condition' } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error(`waitFor 超时：${label}`);
}
