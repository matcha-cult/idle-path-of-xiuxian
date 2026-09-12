/**
 * 通用记录桩：生成一个记录了调用参数的函数。
 *
 * 说明：调用签名与 calls/last 均放宽为 any，使得不同签名的 Stub 之间可自由赋值/断言，
 * 避免 strictFunctionTypes 下形参逆变导致的 TS2322/TS2352；参数类型在断言处按需收窄。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Stub<A extends unknown[] = unknown[], R = unknown> {
  (...args: any[]): R;
  calls: any[];
  readonly callCount: number;
  readonly last: any;
}

export function stub<A extends unknown[] = unknown[], R = undefined>(
  impl?: (...args: A) => R,
): Stub<A, R> {
  const calls: A[] = [];
  const fn = ((...args: A): R => {
    calls.push(args);
    return impl ? impl(...args) : (undefined as R);
  }) as Stub<A, R>;
  fn.calls = calls;
  Object.defineProperty(fn, 'callCount', { get: () => calls.length });
  Object.defineProperty(fn, 'last', { get: () => calls[calls.length - 1] });
  return fn;
}
