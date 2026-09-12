/**
 * combat 逻辑服 Action（L1，cmd 段 90，依赖 item, equip）
 *
 * (90,1) units       单位图鉴 { realm?, camp? }
 * (90,2) dropTables  掉落表图鉴
 * (90,3) spawn       实例化（dev） { code, hiddenCount? }
 * (90,4) kill        击杀结算（dev） { code, count? }
 *
 * 行为对齐旧 REST：/api/game/units、/api/game/drop-tables、/api/game/unit/spawn|kill
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { COMBAT_CMD } from '../../../ionet/cmd.js';
import { ActionError, dataOf, requireUserId, toFiniteInt } from '../../../ionet/action-support.js';
import { UNIT_CAMPS } from '../../game/unit/unit.types.js';
import { CombatLogicService } from './combat.logic.service.js';

@Injectable()
@ActionController(COMBAT_CMD.cmd)
export class CombatAction {
  constructor(private readonly combatLogic: CombatLogicService) {}

  @ActionMethod(COMBAT_CMD.units)
  async units(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const body = dataOf(data);
    const realm = body.realm != null ? toFiniteInt(body.realm) : undefined;
    if (body.realm != null && (realm == null || realm < 1 || realm > 14)) {
      return ActionError.invalidParam('realm 需为 1~14 的整数');
    }
    const camp = typeof body.camp === 'string' && body.camp ? body.camp : undefined;
    if (camp != null && !(UNIT_CAMPS as readonly string[]).includes(camp)) {
      return ActionError.invalidParam('camp 需为 hostile/neutral/friendly');
    }
    return this.combatLogic.catalog(userId, { realm, camp });
  }

  @ActionMethod(COMBAT_CMD.dropTables)
  async dropTables(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.combatLogic.dropTables(userId);
  }

  @ActionMethod(COMBAT_CMD.spawn)
  async spawn(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const body = dataOf(data);
    if (typeof body.code !== 'string' || !body.code.trim()) return ActionError.invalidParam('code 必填');
    const hiddenCount = body.hiddenCount != null ? toFiniteInt(body.hiddenCount) : undefined;
    if (body.hiddenCount != null && hiddenCount == null) return ActionError.invalidParam('hiddenCount 不合法');
    return this.combatLogic.spawn(userId, body.code.trim(), hiddenCount);
  }

  @ActionMethod(COMBAT_CMD.kill)
  async kill(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const body = dataOf(data);
    if (typeof body.code !== 'string' || !body.code.trim()) return ActionError.invalidParam('code 必填');
    const count = body.count != null ? toFiniteInt(body.count) : undefined;
    if (body.count != null && count == null) return ActionError.invalidParam('count 不合法');
    return this.combatLogic.kill(userId, body.code.trim(), count);
  }
}
