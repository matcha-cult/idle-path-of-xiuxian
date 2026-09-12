/**
 * 通用记录桩：生成一个记录了调用参数的函数。
 */
export interface Stub<A extends unknown[] = unknown[], R = unknown> {
  (...args: A): R;
  calls: A[];
  callCount: number;
  last: A | undefined;
}

export function stub<A extends unknown[] = unknown[], R = undefined>(impl?: (...args: A) => R): Stub<A, R> {
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
