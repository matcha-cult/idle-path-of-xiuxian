/**
 * WS 鉴权 InOut（v1）
 *
 * 背景：ionet-ts 的 WebSocketExternalServer.handleMessage 只从报文里取
 * { cmd, subCmd, data } 后再 execute，headers / traceId 被丢弃、无握手鉴权，
 * 因此 v1 把 JWT 放进 data.__token：
 *   { "cmd": 30, "subCmd": 1, "data": { "__token": "<jwt>", ... } }
 *
 * 本 InOut 在 Action 执行前校验 token 并绑定 userId（FlowContext.bindingUserId）。
 * 白名单（cmd.ts PUBLIC_ACTION_KEYS）里的 Action 免鉴权。
 * 未携带/非法 token 时不绑定，Action 侧经 requireUserId() 返回 UNAUTHORIZED。
 *
 * TODO(M6)：框架支持握手鉴权后改为标准 Authorization 通道。
 */
import { Injectable } from '@nestjs/common';
import { type ActionMethodInOut, type FlowContext } from '@nbb-ionet/core-framework';
import { AuthService } from '../modules/auth/auth.service.js';
import { PUBLIC_ACTION_KEYS } from './cmd.js';

/** 报文 data 里承载 JWT 的字段名（v1 约定） */
export const WS_TOKEN_FIELD = '__token';

@Injectable()
export class WsAuthInOut implements ActionMethodInOut {
  constructor(private readonly authService: AuthService) {}

  fuckIn(ctx: FlowContext): void {
    const cmdInfo = ctx.getCmdInfo();
    const token = this.extractToken(ctx);
    if (PUBLIC_ACTION_KEYS.has(cmdInfo.cmdMerge)) {
      return;
    }

    if (!token) return;

    const result = this.authService.verifyToken(token);
    if (!result.valid || !result.decoded) return;

    ctx.bindingUserId(BigInt(result.decoded.id));
  }

  fuckOut(_ctx: FlowContext): void {
    // v1 无出栈副作用；预留给响应加签 / 访问审计
  }

  /** 读取并剥离 data.__token，避免泄漏给业务层 */
  private extractToken(ctx: FlowContext): string | undefined {
    const data = ctx.getRequest()?.data;
    if (data == null || typeof data !== 'object') return undefined;
    const holder = data as Record<string, unknown>;
    const raw = holder[WS_TOKEN_FIELD];
    if (WS_TOKEN_FIELD in holder) {
      delete holder[WS_TOKEN_FIELD];
    }
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  }
}
