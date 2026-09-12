/**
 * idle 逻辑服 Action（L4，cmd 段 130）
 *
 * - (130,1) status  离线收益状态
 * - (130,2) settle  离线结算
 *
 * Action 化模板（M2 沉淀，后续各服照此）：
 * 1. `@Injectable()` + `@ActionController(XXX_CMD.cmd)`，方法标 `@ActionMethod(XXX_CMD.xxx)`；
 * 2. 方法签名固定 `(ctx: FlowContext, data: unknown)`，用 `requireUserId(ctx)` 做鉴权；
 * 3. 参数从 `data` 取，用 `action-support` 的解析器校验；非法直接返回 `ActionError.invalidParam`；
 * 4. 不做业务实现，只把请求转给本服门面 `XXXLogicService`；
 * 5. 返回值沿用 `{ success, message, data? }`，由骨架包进响应信封。
 *
 * ⚠️ FlowContext 必须**以值导入**（`import { FlowContext }`），不能用 `import { type FlowContext }`：
 *    type-only 导入会被 tsc 擦除，emitDecoratorMetadata 只能退化写成 `Function`，
 *    骨架据此无法把首参识别为 FLOW_CONTEXT（会误判为 DATA），鉴权取值随之失败。
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { IDLE_CMD } from '../../../ionet/cmd.js';
import { ActionError, dataOf, requireUserId, toFiniteNumber } from '../../../ionet/action-support.js';
import { IdleLogicService } from './idle.logic.service.js';

@Injectable()
@ActionController(IDLE_CMD.cmd)
export class IdleAction {
  constructor(private readonly idleLogic: IdleLogicService) {}

  @ActionMethod(IDLE_CMD.status)
  async status(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.idleLogic.status(userId);
  }

  @ActionMethod(IDLE_CMD.settle)
  async settle(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;

    const body = dataOf(data);
    let unitCode: string | undefined;
    if (body.unitCode != null) {
      if (typeof body.unitCode !== 'string' || !body.unitCode.trim()) {
        return ActionError.invalidParam('unitCode 不合法');
      }
      unitCode = body.unitCode.trim();
    }

    let hours: number | undefined;
    if (body.hours != null) {
      const parsed = toFiniteNumber(body.hours);
      if (parsed == null) return ActionError.invalidParam('hours 不合法');
      hours = parsed;
    }

    return this.idleLogic.settle(userId, unitCode, hours);
  }
}
