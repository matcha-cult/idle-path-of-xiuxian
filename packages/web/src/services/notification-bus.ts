/**
 * 推送路由总线（02 §3.4）：服务端 `kind='notification'` 帧按 `(cmd, subCmd)` 或 `type` 分发。
 *
 * 与请求流水线完全隔离：请求只消费 `kind='response'` 的帧（A3 `classifyFrame` 已分流）。
 */
import type { NotificationMessage } from '@idle-path/ionet-transport';

export type NotificationHandler = (notification: NotificationMessage) => void;
export type Unsubscribe = () => void;

function keyOf(cmd: number, subCmd: number): string {
  return `${cmd}:${subCmd}`;
}

export class NotificationBus {
  private readonly byRoute = new Map<string, Set<NotificationHandler>>();
  private readonly byType = new Map<string, Set<NotificationHandler>>();
  private readonly wildcard = new Set<NotificationHandler>();

  /** 订阅 `(cmd, subCmd)` 路由的推送（如 idle 段产线更新）。 */
  on(cmd: number, subCmd: number, handler: NotificationHandler): Unsubscribe {
    const key = keyOf(cmd, subCmd);
    let set = this.byRoute.get(key);
    if (set === undefined) {
      set = new Set();
      this.byRoute.set(key, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  }

  /** 订阅 `{type}` 形式的推送（与 cmd/subCmd 编码体系并列，02 §3.4）。 */
  onType(type: string, handler: NotificationHandler): Unsubscribe {
    let set = this.byType.get(type);
    if (set === undefined) {
      set = new Set();
      this.byType.set(type, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  }

  /** 订阅全部推送（诊断/日志用）。 */
  onAny(handler: NotificationHandler): Unsubscribe {
    this.wildcard.add(handler);
    return () => this.wildcard.delete(handler);
  }

  dispatch(notification: NotificationMessage): void {
    const handlers = new Set<NotificationHandler>(this.wildcard);
    if (typeof notification.cmd === 'number' && typeof notification.subCmd === 'number') {
      for (const handler of this.byRoute.get(keyOf(notification.cmd, notification.subCmd)) ?? []) {
        handlers.add(handler);
      }
    }
    if (typeof notification.type === 'string' && notification.type.length > 0) {
      for (const handler of this.byType.get(notification.type) ?? []) handlers.add(handler);
    }
    for (const handler of handlers) {
      try {
        handler(notification);
      } catch (error) {
        // 单个订阅者异常不影响其它订阅者
        console.error('[NotificationBus] handler error', error);
      }
    }
  }

  clear(): void {
    this.byRoute.clear();
    this.byType.clear();
    this.wildcard.clear();
  }
}
