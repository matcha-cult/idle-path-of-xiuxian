/**
 * 测试用 FlowContext：直接用 core-framework 的真实类，不经过 NestJS 容器
 * （esbuild/tsx 不产出 design:paramtypes，任何按类型注入的路径在单测里都不可用）。
 */
import { CmdInfo, FlowContext } from '@nbb-ionet/core-framework';

export interface FlowOptions {
  userId?: number | bigint;
  cmd?: number;
  subCmd?: number;
  data?: unknown;
}

export function flowContext(options: FlowOptions = {}): FlowContext {
  const ctx = new FlowContext();
  if (options.userId != null) {
    ctx.bindingUserId(BigInt(options.userId));
  }
  const cmd = options.cmd ?? 0;
  const subCmd = options.subCmd ?? 0;
  ctx.setCmdInfo(CmdInfo.of(cmd, subCmd));
  ctx.setRequest({ cmd, subCmd, data: options.data });
  return ctx;
}

/** 已鉴权上下文 */
export function authedContext(userId = 1, options: Omit<FlowOptions, 'userId'> = {}): FlowContext {
  return flowContext({ ...options, userId });
}
