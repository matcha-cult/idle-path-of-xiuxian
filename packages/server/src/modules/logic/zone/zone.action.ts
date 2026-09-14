/**
 * zone 逻辑服 Action（L2，cmd 段 100，依赖 combat, item, equip）
 *
 * (100,1) zones       秘境图鉴（**只含已突破的秘境** + 全量突破名录 + 挂机点，§22）
 * (100,2) progress    当前在线战斗进度（无参；未在战斗 → NO_ONLINE_BATTLE）
 * (100,3) enter       进入已突破秘境的战斗（重复挑战）{ zoneCode }
 * (100,4) challenge   层数挑战（**开发者工具**，R2 §4.3）{ zoneCode? }
 * (100,5) online      在线历练实况（同一 subCmd 也是服务端推送路由，P3.0）
 * (100,6) visibility  页面可见性上报 { visible }（P3.0 T2；只报可见性，不报时长）
 * (100,7) breakthrough 突破秘境 → 进入在线战斗 { zoneCode }（§22；training 免费 / special 需道具）
 * (100,8) leave        离开当前战斗（§22 Q3 通关自动离开之外，玩家也可手动离开）
 * (100,9) idleTarget   设置离线挂机点 { zoneCode }（需已突破且 idle_allowed）
 *
 * 行为对齐旧 REST：/api/game/zones、/api/game/zone/progress|enter|challenge
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { ZONE_CMD } from '../../../ionet/cmd.js';
import { ActionError, dataOf, requireUserId } from '../../../ionet/action-support.js';
import { ZoneLogicService } from './zone.logic.service.js';

@Injectable()
@ActionController(ZONE_CMD.cmd)
export class ZoneAction {
  constructor(private readonly zoneLogic: ZoneLogicService) {}

  @ActionMethod(ZONE_CMD.zones)
  async zones(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.zoneLogic.catalog(userId);
  }

  @ActionMethod(ZONE_CMD.progress)
  async progress(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.zoneLogic.progress(userId);
  }

  @ActionMethod(ZONE_CMD.enter)
  async enter(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const zoneCode = dataOf(data).zoneCode;
    if (typeof zoneCode !== 'string' || !zoneCode.trim()) return ActionError.invalidParam('zoneCode 必填');
    return this.zoneLogic.enter(userId, zoneCode.trim());
  }

  @ActionMethod(ZONE_CMD.challenge)
  async challenge(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const raw = dataOf(data).zoneCode;
    let zoneCode: string | undefined;
    if (raw != null) {
      if (typeof raw !== 'string' || !raw.trim()) return ActionError.invalidParam('zoneCode 不合法');
      zoneCode = raw.trim();
    }
    return this.zoneLogic.challenge(userId, zoneCode);
  }

  /** (100,5) 在线历练实况：无参数；离线 / 未在战斗也是成功信封（带 reason）。 */
  @ActionMethod(ZONE_CMD.online)
  async online(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.zoneLogic.online(userId);
  }

  /**
   * (100,6) 页面可见性上报 `{ visible: boolean }`。
   *
   * ⚠️ 只接受严格的 boolean：字符串 `'false'` / 数字 / 缺失都判 `INVALID_PARAM` ——
   * 避免「客户端随手传个真值」把在线判定打开。**不接受任何时长字段**（R2 §4.2）。
   */
  @ActionMethod(ZONE_CMD.visibility)
  async visibility(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const visible = dataOf(data).visible;
    if (typeof visible !== 'boolean') return ActionError.invalidParam('visible 必须是 boolean');
    return this.zoneLogic.setVisibility(userId, visible);
  }

  /** (100,7) 突破秘境（§22 Q1/Q3）：只校验 zoneCode，境界/战力一律放行（"送人头都行"）。 */
  @ActionMethod(ZONE_CMD.breakthrough)
  async breakthrough(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const zoneCode = dataOf(data).zoneCode;
    if (typeof zoneCode !== 'string' || !zoneCode.trim()) return ActionError.invalidParam('zoneCode 必填');
    return this.zoneLogic.breakthrough(userId, zoneCode.trim());
  }

  /** (100,8) 离开当前战斗（§22 Q3 通关自动离开之外，玩家也可手动离开）。 */
  @ActionMethod(ZONE_CMD.leave)
  async leave(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.zoneLogic.leave(userId);
  }

  /** (100,9) 设置挂机点 { zoneCode }（需已突破且 idle_allowed）。 */
  @ActionMethod(ZONE_CMD.idleTarget)
  async idleTarget(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const zoneCode = dataOf(data).zoneCode;
    if (typeof zoneCode !== 'string' || !zoneCode.trim()) return ActionError.invalidParam('zoneCode 必填');
    return this.zoneLogic.idleTarget(userId, zoneCode.trim());
  }
}