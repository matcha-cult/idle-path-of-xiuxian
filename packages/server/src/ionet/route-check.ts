/**
 * Action 路由表检查（纯逻辑，便于单元测试）
 *
 * 同一 (cmd, subCmd) 只能注册一个 Action；重复即启动期失败。
 */
export interface RouteEntry {
  cmd: number;
  subCmd: number;
  label: string;
}

export interface DuplicateRoute {
  cmd: number;
  subCmd: number;
  labels: string[];
}

export function findDuplicateRoutes(entries: readonly RouteEntry[]): DuplicateRoute[] {
  const seen = new Map<number, { cmd: number; subCmd: number; labels: string[] }>();
  for (const entry of entries) {
    const key = (entry.cmd << 16) | entry.subCmd;
    const bucket = seen.get(key);
    if (bucket) {
      bucket.labels.push(entry.label);
    } else {
      seen.set(key, { cmd: entry.cmd, subCmd: entry.subCmd, labels: [entry.label] });
    }
  }
  return [...seen.values()].filter((bucket) => bucket.labels.length > 1);
}

export function assertNoDuplicateRoutes(entries: readonly RouteEntry[]): void {
  const duplicates = findDuplicateRoutes(entries);
  if (duplicates.length === 0) return;
  const detail = duplicates
    .map((d) => `cmd=${d.cmd} subCmd=${d.subCmd}（${d.labels.join(', ')}）`)
    .join('；');
  throw new Error('[ionet] 重复路由：' + detail);
}
