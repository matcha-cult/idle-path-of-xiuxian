/**
 * 系统/健康 Action（cmd 段 1，见 cmd.ts）
 *
 * system.ping 是免鉴权白名单里的 Action，用于 WS 通道冒烟与心跳探活。
 * 作为 provider 由各 LogicModule 提供；框架在 onModuleInit 经 resolveAction 从容器解析实例并注册（具备 DI）。
 *
 * P3.0 T2：心跳同时充当**在线会话登记**的 touch 源（R2 §4.2「在线 = 活着的 WS 会话」）。
 * 免鉴权意味着未带合法 token 的连接也能 ping，此时 `ctx.getUserId()` 为 0n，touch 直接忽略；
 * 已验证的连接由框架在 execute 前预置 userId，于是「每 15s 一次 ping」天然刷新在线窗口。
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod, FlowContext } from '@nbb-ionet/core-framework';
import { SYSTEM_CMD } from './cmd.js';
import { userIdOf } from './action-support.js';
import { OnlineSessionService } from '../modules/online/online-session.service.js';

@Injectable()
@ActionController(SYSTEM_CMD.cmd)
export class HealthAction {
  constructor(private readonly onlineSessions: OnlineSessionService) {}

  @ActionMethod(SYSTEM_CMD.ping)
  ping(ctx: FlowContext): { status: string; service: string; timestamp: number } {
    // 未鉴权（userId=0n）→ userIdOf 返回 null → 只回 pong，不登记会话
    const userId = userIdOf(ctx);
    if (userId !== null) this.onlineSessions.touch(userId);
    return {
      status: 'ok',
      service: 'idle-path-of-xiuxian',
      timestamp: Date.now(),
    };
  }
}
