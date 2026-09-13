/**
 * ToastStore —— 错误码 → 文案转译 + 轻量提示队列（02 §4.1）。
 *
 * 三种失败来源统一入口 `fromError`：
 * - `TransportError`（errorCode 400/404/500，PROTOCOL.md §8）；
 * - `BusinessError`（`data.success === false`，06 §2 主路径）；
 * - `RestError`（REST 非 2xx / 网络错误）。
 *
 * 展示优先级（07 §3）：服务端 message（最具体）＞ 本地码表兜底 ＞ 通用兜底。
 */
import { makeAutoObservable, runInAction } from 'mobx';
import {
  BusinessError,
  ConnectionError,
  HandshakeError,
  ProtocolError,
  RequestTimeoutError,
  TransportError,
  businessErrorMessage,
  TRANSPORT_ERROR_MESSAGES,
} from '@idle-path/ionet-transport';
import { RestError } from '@idle-path/ionet-transport';

export type ToastLevel = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  level: ToastLevel;
  title: string;
  message?: string;
  /** 业务/传输错误码（便于 UI 分类与去重）。 */
  code?: string | number;
}

let toastSeq = 0;

export class ToastStore {
  toasts: Toast[] = [];
  /** 最多同时展示条数（超出丢弃最旧的）。 */
  max = 4;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  push(toast: Omit<Toast, 'id'>): number {
    const id = ++toastSeq;
    this.toasts = [...this.toasts, { ...toast, id }].slice(-this.max);
    return id;
  }

  success(title: string, message?: string): number {
    return this.push({ level: 'success', title, ...(message !== undefined ? { message } : {}) });
  }

  info(title: string, message?: string): number {
    return this.push({ level: 'info', title, ...(message !== undefined ? { message } : {}) });
  }

  error(title: string, message?: string): number {
    return this.push({ level: 'error', title, ...(message !== undefined ? { message } : {}) });
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  /**
   * 取走并清空队列（供 UI 桥接到 antd `message`/`notification`）。
   *
   * 设计：Store 只负责「错误 → 文案」的判定与排队，**展示归 UI 层**（规划 09 §6.2 B9）。
   * `ToastBridge` 消费后再交给 antd 渲染，因此消费后队列为空，不会双重展示。
   */
  consume(): Toast[] {
    const drained = this.toasts;
    if (drained.length > 0) this.toasts = [];
    return drained;
  }

  clear(): void {
    this.toasts = [];
  }

  /** 统一把异常转成 Toast；返回被消费的错误码（便于调用方分支）。 */
  fromError(error: unknown, fallbackTitle = '操作失败'): string | number | undefined {
    if (error instanceof BusinessError) {
      this.push({
        level: 'error',
        title: error.serverMessage ?? businessErrorMessage(error.code),
        message: `[${error.code}]`,
        code: error.code,
      });
      return error.code;
    }
    if (error instanceof TransportError) {
      this.push({
        level: 'error',
        title: TRANSPORT_ERROR_MESSAGES[error.errorCode] ?? `传输错误（${error.errorCode}）`,
        message: error.message,
        code: error.errorCode,
      });
      return error.errorCode;
    }
    if (error instanceof RestError) {
      const title = error.status === 401 ? '登录状态已失效，请重新登录' : fallbackTitle;
      this.push({ level: 'error', title, message: error.message, code: error.status });
      return error.status;
    }
    if (error instanceof HandshakeError) {
      this.push({ level: 'error', title: '连接失败', message: error.message, code: error.closeCode });
      return error.closeCode;
    }
    if (error instanceof RequestTimeoutError || error instanceof ConnectionError) {
      this.push({ level: 'error', title: error.message });
      return undefined;
    }
    if (error instanceof ProtocolError) {
      this.push({ level: 'error', title: '协议解析失败', message: error.message });
      return undefined;
    }
    const message = error instanceof Error ? error.message : String(error);
    this.push({ level: 'error', title: fallbackTitle, message });
    return undefined;
  }

  /** 直接按业务码提示（当调用方拿到 `allowBusinessFailure` 的失败体时）。 */
  fromBusinessCode(code: string, message?: string): void {
    runInAction(() => {
      this.push({ level: 'error', title: message ?? businessErrorMessage(code), message: `[${code}]`, code });
    });
  }
}
