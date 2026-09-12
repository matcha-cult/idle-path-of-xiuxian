/**
 * 对外服服务实现（EdgeService）
 *
 * 职责：广播 / 通知 / 推送。不承载任何业务路由，不依赖任何业务服务。
 *
 * 现状（submodule `d9a3beb`）：
 * - 握手鉴权由 `app.module.ts` 的 `wsServer.authenticate` 承担；
 * - 连接注册表由框架 `6dae720` 维护，`sendTo(userId, …)` **已可用**（未命中返回 false）；
 * - 推送信封统一补 `kind: 'notification'`，使客户端能把它与响应区分（框架 `6a31847`）。
 *
 * 依赖反转：逻辑服只依赖 `NotificationPort`，由本模块提供实现（token: NOTIFICATION_PORT）。
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

/** 出站推送信封：补 kind 判别字段 */
function toWireMessage(message: NotificationMessage): Record<string, unknown> {
  return { kind: 'notification', cmd: message.cmd, subCmd: message.subCmd, data: message.data };
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
    this.wsServer.broadcast(toWireMessage(message));
  }

  sendTo(userId: number, message: NotificationMessage): boolean {
    if (!this.wsServer) return false;
    return this.wsServer.sendTo(BigInt(userId), toWireMessage(message));
  }

  /** 在线连接数（运维/健康可见） */
  get connectionCount(): number {
    return this.wsServer?.clientCount ?? 0;
  }
}
