/**
 * 对外服端口（依赖反转）
 *
 * 逻辑服不允许直接依赖对外服实现，只能依赖本接口并投递消息；
 * 由对外服 EdgeModule 提供实现（provider token: NOTIFICATION_PORT）。
 * 这样「业务 → 端口 → 实现」单向，不会形成环。
 */
export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');

/** 推送信封：与 WS 请求同构的 cmd/subCmd/data */
export interface NotificationMessage {
  cmd: number;
  subCmd: number;
  data?: unknown;
}

export interface NotificationPort {
  /** 广播给所有在线连接 */
  broadcast(message: NotificationMessage): void;
  /** 定向推送给某用户；v1 受框架限制可能返回 false */
  sendTo(userId: number, message: NotificationMessage): boolean;
}
