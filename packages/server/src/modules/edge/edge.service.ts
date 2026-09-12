/**
 * 对外服服务实现（EdgeService）
 *
 * 职责：广播 / 通知 / 推送；连接握手鉴权由 ws-auth.inout.ts 负责。
 * 不承载任何业务路由，不依赖任何业务服务。
 *
 * v1 说明：
 * - broadcast 直接复用 ionet WebSocketExternalServer.broadcast；
 * - sendTo 依赖 ClientConnection.userId，而框架当前无赋值点（P0-4），
 *   故 v1 实际返回 false；M6 修框架后自动生效。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { IONET_WS_SERVER } from '@nbb-ionet/extension-nestjs';
import { type NotificationMessage, type NotificationPort } from '../../common/ports/notification.port.js';

/** 对外服所需的 ionet WS 外部服务最小结构（不直接依赖 external-server 类型） */
export interface EdgeWsServer {
  broadcast(message: unknown): void;
  sendTo(userId: bigint, message: unknown): boolean;
  readonly clientCount: number;
}

@Injectable()
export class EdgeService implements NotificationPort {
  private readonly logger = new Logger(EdgeService.name);

  constructor(
    @Optional() @Inject(IONET_WS_SERVER) private readonly wsServer: EdgeWsServer | null,
  ) {}

  broadcast(message: NotificationMessage): void {
    if (!this.wsServer) {
      this.logger.warn('WS 外部服务未启动，广播丢弃');
      return;
    }
    this.wsServer.broadcast(message);
  }

  sendTo(userId: number, message: NotificationMessage): boolean {
    if (!this.wsServer) return false;
    return this.wsServer.sendTo(BigInt(userId), message);
  }

  /** 在线连接数（运维/健康可见） */
  get connectionCount(): number {
    return this.wsServer?.clientCount ?? 0;
  }
}
