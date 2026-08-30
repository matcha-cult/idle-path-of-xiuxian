/**
 * ionet-ts 官方示例 Action
 *
 * 仅用于展示 ionet-ts ActionController/ActionMethod 用法。
 * 当前用户系统模块的 HTTP 接口全部走 NestJS，不在此暴露。
 */
import { ActionController, ActionMethod } from '@nbb-ionet/core-framework';

@ActionController(0)
export class HealthAction {
  @ActionMethod(1)
  ping(): { status: string; service: string } {
    return {
      status: 'ok',
      service: 'idle-path-of-xiuxian',
    };
  }
}
