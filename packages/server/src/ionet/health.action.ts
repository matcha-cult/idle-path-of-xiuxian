/**
 * 系统/示例 Action（cmd 段 1，见 cmd.ts 分段规划）
 *
 * 仅用于展示 ionet-ts ActionController/ActionMethod 用法，并占用系统示例段。
 * 注意：本 Action 只注册进 IonetModule.forRoot 构建的 BarSkeleton，
 * 当前 httpServer/wsServer 均关闭，无外部服务消费它（纯示例/保留位）；
 * 用户系统模块的 HTTP 接口全部走 NestJS，不在此暴露。
 */
import { ActionController, ActionMethod } from '@nbb-ionet/core-framework';
import { SYSTEM_CMD } from './cmd.js';

@ActionController(SYSTEM_CMD.cmd)
export class HealthAction {
  @ActionMethod(SYSTEM_CMD.ping)
  ping(): { status: string; service: string } {
    return {
      status: 'ok',
      service: 'idle-path-of-xiuxian',
    };
  }
}
