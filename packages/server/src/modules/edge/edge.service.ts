/**
 * 对外服服务实现（EdgeService）
 *
 * 职责：广播 / 通知 / 推送。不承载任何业务路由，不依赖任何业务服务。
 *
 * 现状（submodule `2946f06`）：
 * - 握手鉴权由 `app.module.ts` 的 `wsServer.authenticate` 承担；
 * - 连接注册表由框架维护，`sendNotification(userId, …)` **已可用**（未命中返回 false）；
 * - 推送信封统一由框架 `createNotificationMessage` 构造（补 `kind: 'notification'` 与
 *   `timestamp`），业务只提供内容、不自造形状（P1-3 规范化推送）。
 *
 * 依赖反转：逻辑服只依赖 `NotificationPort`，由本模块提供实现（token: NOTIFICATION_PORT）。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { IONET_WS_SERVER } from '@nbb-ionet/extension-nestjs';
import { type NotificationMessage, type NotificationPort } from '../../common/ports/notification.port.js';

/** 对外服所需的 ionet WS 外部服务最小结构（不直接依赖 external-server 类型） */
export interface EdgeWsServer {
  /** P1-3 规范化群发：框架统一补 kind='notification' 信封（业务不得自造形状） */
  broadcastNotification(notification: NotificationMessage): void;
  /** P1-3 规范化定向推送：至少命中一个 OPEN 连接返回 true，未命中/0n 返回 false */
  sendNotification(userId: bigint, notification: NotificationMessage): boolean;
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
    this.wsServer.broadcastNotification(message);
  }

  sendTo(userId: number, message: NotificationMessage): boolean {
    if (!this.wsServer) return false;
    return this.wsServer.sendNotification(BigInt(userId), message);
  }

  /** 在线连接数（运维/健康可见） */
  get connectionCount(): number {
    return this.wsServer?.clientCount ?? 0;
  }
}
