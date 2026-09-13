/**
 * map 逻辑服 Action（L2，cmd 段 140，settings-revision-2 §5）
 *
 * (140,1) list      地图线路图（只含已发现节点 + 边 + 进度）
 * (140,2) enter     跑图移动 { nodeCode }
 * (140,3) waypoint  传送直达 { nodeCode }
 *
 * 无旧 REST 对应，是 R2 新增域；模板照 zone.action.ts。
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { MAP_CMD } from '../../../ionet/cmd.js';
import { ActionError, dataOf, requireUserId } from '../../../ionet/action-support.js';
import { MapLogicService } from './map.logic.service.js';

@Injectable()
@ActionController(MAP_CMD.cmd)
export class MapAction {
  constructor(private readonly mapLogic: MapLogicService) {}

  @ActionMethod(MAP_CMD.list)
  async list(ctx: FlowContext, _data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    return this.mapLogic.list(userId);
  }

  @ActionMethod(MAP_CMD.enter)
  async enter(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const nodeCode = dataOf(data).nodeCode;
    if (typeof nodeCode !== 'string' || !nodeCode.trim()) return ActionError.invalidParam('nodeCode 必填');
    return this.mapLogic.enter(userId, nodeCode.trim());
  }

  @ActionMethod(MAP_CMD.waypoint)
  async waypoint(ctx: FlowContext, data: unknown): Promise<unknown> {
    const userId = requireUserId(ctx);
    if (typeof userId !== 'number') return userId;
    const nodeCode = dataOf(data).nodeCode;
    if (typeof nodeCode !== 'string' || !nodeCode.trim()) return ActionError.invalidParam('nodeCode 必填');
    return this.mapLogic.waypoint(userId, nodeCode.trim());
  }
}
