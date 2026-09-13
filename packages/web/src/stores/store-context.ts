/**
 * StoreContext —— 域 Store 的统一注入面（06 §6 E3 方案 C：无装饰器 + 构造注入）。
 *
 * 设计意图：
 * - 域 Store 之间不直接互相 import 类，只依赖本接口，避免 Store 层的循环依赖；
 * - `root()` 是**延迟取根**函数：域 Store 需要在动作成功后触发别的域刷新
 *   （如装备成功后刷新背包），但根 Store 持有所有域 Store，构造期无法拿到实例，
 *   因此用闭包在调用时才求值。
 *
 * 错误处理口径：本接口只提供依赖，不提供错误策略；各 Store 自行 try/catch +
 * `toast.fromError(error, 'XXX失败')`，不让异常穿透到 UI 事件处理器。
 */
import type { GameApi, IonetClient } from '@idle-path/ionet-transport';
import type { RootStore } from '../app/root-store.js';
import type { SessionStore } from './session-store.js';
import type { ToastStore } from './toast-store.js';

export interface StoreContext {
  /** WS typed API（46 个 Action 的 12 个子域入口）。 */
  game: GameApi;
  /** 连接客户端（供 ConnectionStore 指标轮询与推送订阅）。 */
  ionet: IonetClient;
  /** 提示队列（错误码 → 文案转译的唯一出口）。 */
  toast: ToastStore;
  /** 会话（token / 角色基础信息）。 */
  session: SessionStore;
  /** 延迟取根 Store（避免构造期循环引用）。 */
  root: () => RootStore;
}
