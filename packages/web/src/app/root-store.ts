/**
 * RootStore —— 应用唯一的组合根（06 §6 E3）。
 *
 * 职责：
 * - 装配 GameClient（WS 状态机 + REST + typed GameApi）与各域 Store；
 * - 把 transport 回调接到 Store：状态 → ConnectionStore，serverTime → ConnectionStore，
 *   业务错误 → ToastStore；推送经 `NotificationBus` 在 `startNotificationRouting` 订阅；
 * - 会话生命周期编排：bootstrap / login / register / createCharacter / logout / loadPanel；
 * - 指标轮询（默认 1s）与资源释放（`dispose`）。
 *
 * 错误口径：本类**不向上抛**。登录/连接失败经 Toast 提示后返回 false 或继续；
 * `loadPanel()` 各域独立失败由各自 Store 吞掉，`Promise.all` 不会 reject。
 */
import { IDLE_CMD, ZONE_CMD, BrowserLifecycleAdapter } from '@idle-path/ionet-transport';
import type {
  FetchLike,
  HeartbeatOptions,
  LifecycleAdapter,
  ReconnectOptions,
  SocketAdapterFactory,
} from '@idle-path/ionet-transport';
import { GameClient, resolveApiBaseUrl, resolveWsUrl } from '../services/game-client.js';
import { CombatStore } from '../stores/combat-store.js';
import { ConnectionStore } from '../stores/connection-store.js';
import { EconomyStore } from '../stores/economy-store.js';
import { EquipStore } from '../stores/equip-store.js';
import { IdleStore } from '../stores/idle-store.js';
import { ItemStore } from '../stores/item-store.js';
import { MapStore } from '../stores/map-store.js';
import { PropStore } from '../stores/prop-store.js';
import { QuestStore } from '../stores/quest-store.js';
import { RealmStore } from '../stores/realm-store.js';
import { SessionStore } from '../stores/session-store.js';
import { resolveStorage, type StorageLike } from '../services/storage.js';
import { ThemeStore } from '../theme/theme-store.js';
import { SkillStore } from '../stores/skill-store.js';
import { StoryStore } from '../stores/story-store.js';
import { ToastStore } from '../stores/toast-store.js';
import { ZoneStore } from '../stores/zone-store.js';
import type { StoreContext } from '../stores/store-context.js';

/** 默认指标轮询间隔（毫秒）。 */
const DEFAULT_METRICS_INTERVAL_MS = 1000;

/** 推送帧的最小结构面（避免依赖 transport 未导出的 NotificationMessage）。 */
interface PushFrame {
  cmd?: number;
  subCmd?: number;
  type?: string;
  data?: unknown;
}

export interface RootStoreOptions {
  /** WS 端点；缺省同源 `/ws`。 */
  wsUrl?: string;
  /** REST 前缀；缺省同源 `/api`。 */
  apiBaseUrl?: string;
  fetchImpl?: FetchLike;
  /** 缺省用浏览器 localStorage（不可用时内存实现）。 */
  storage?: StorageLike;
  /** 测试注入 socket 适配器。 */
  adapterFactory?: SocketAdapterFactory;
  lifecycle?: LifecycleAdapter;
  heartbeat?: HeartbeatOptions | false;
  reconnect?: ReconnectOptions;
  /** `connection.refreshMetrics()` 轮询间隔；缺省 1000，设 0 关闭。 */
  autoRefreshMetricsMs?: number;
}

export class RootStore {
  readonly toast: ToastStore;
  readonly theme: ThemeStore;
  readonly session: SessionStore;
  readonly connection: ConnectionStore;
  readonly client: GameClient;
  readonly item: ItemStore;
  readonly prop: PropStore;
  readonly equip: EquipStore;
  readonly skill: SkillStore;
  readonly economy: EconomyStore;
  readonly realm: RealmStore;
  readonly combat: CombatStore;
  readonly zone: ZoneStore;
  readonly quest: QuestStore;
  readonly story: StoryStore;
  readonly idle: IdleStore;
  readonly map: MapStore;

  private readonly autoRefreshMetricsMs: number;
  private metricsTimer: ReturnType<typeof setInterval> | null = null;
  private routingStarted = false;
  private readonly routingUnsubscribers: Array<() => void> = [];
  /**
   * 生命周期适配器（P3.0 T2）：同一实例同时喂给 `GameClient`（断线/重连）与
   * 「页面可见性上报」。未注入时用浏览器实现（无 document 环境自动退化为 no-op）。
   */
  private readonly lifecycle: LifecycleAdapter;

  constructor(options: RootStoreOptions = {}) {
    this.toast = new ToastStore();
    this.lifecycle = options.lifecycle ?? new BrowserLifecycleAdapter();

    // 回调闭包在连接/请求发生时才读取 this.*，因此此处先建 client 再建各 Store 是安全的。
    this.client = new GameClient({
      url: options.wsUrl ?? resolveWsUrl(),
      baseUrl: options.apiBaseUrl ?? resolveApiBaseUrl(),
      fetchImpl: options.fetchImpl,
      getToken: () => this.session.token ?? undefined,
      callbacks: {
        onStateChange: (state, detail) => {
          this.connection.handleStateChange(state, detail);
          // 连上即声明「页面可见」：服务端在线判定同时要求可见位，
          // 若上一次 hidden 上报恰好丢在断链里，这里把它纠回来（幂等）。
          if (state === 'online' && !this.lifecycle.isHidden()) this.zone.reportVisibility(true);
        },
        onBusinessError: (error) => this.toast.fromError(error),
        onServerTime: (info) => this.connection.handleServerTime(info),
      },
      heartbeat: options.heartbeat,
      reconnect: options.reconnect,
      adapterFactory: options.adapterFactory,
      lifecycle: this.lifecycle,
    });

    // 存储只解析一次：若两次解析会在「无 localStorage 且未显式传入」时得到两个不同的内存实现
    const storage = resolveStorage(options.storage);
    this.theme = new ThemeStore(storage);
    this.session = new SessionStore(this.client.rest, storage, this.toast);
    this.connection = new ConnectionStore(this.client.ionet);

    const ctx: StoreContext = {
      game: this.client.game,
      ionet: this.client.ionet,
      toast: this.toast,
      session: this.session,
      root: () => this,
    };
    this.item = new ItemStore(ctx);
    this.prop = new PropStore(ctx);
    this.equip = new EquipStore(ctx);
    this.skill = new SkillStore(ctx);
    this.economy = new EconomyStore(ctx);
    this.realm = new RealmStore(ctx);
    this.combat = new CombatStore(ctx);
    this.zone = new ZoneStore(ctx);
    this.quest = new QuestStore(ctx);
    this.story = new StoryStore(ctx);
    this.idle = new IdleStore(ctx);
    this.map = new MapStore(ctx);

    this.autoRefreshMetricsMs = options.autoRefreshMetricsMs ?? DEFAULT_METRICS_INTERVAL_MS;
    this.startMetricsPolling();
    this.startNotificationRouting();
    this.startVisibilityReporting();
  }

  /** 恢复会话；有 token 则连接 WS（失败不抛，仅 toast）。 */
  async bootstrap(): Promise<void> {
    if (!this.session.restore()) return;
    try {
      await this.client.connect();
    } catch (error) {
      this.toast.fromError(error, '连接失败');
    }
    await Promise.all([this.session.loadCharacter(), this.loadPanel()]);
  }

  /** T3：登录 → `?token=` 连 WS → **并发**拉面板。 */
  async login(username: string, password: string): Promise<boolean> {
    const ok = await this.session.login(username, password);
    if (!ok) return false;
    this.startMetricsPolling();
    await this.connectAfterAuth();
    await Promise.all([this.session.loadCharacter(), this.loadPanel()]);
    return true;
  }

  async register(username: string, password: string): Promise<boolean> {
    const ok = await this.session.register(username, password);
    if (!ok) return false;
    this.startMetricsPolling();
    await this.connectAfterAuth();
    await Promise.all([this.session.loadCharacter(), this.loadPanel()]);
    return true;
  }

  async createCharacter(nickname: string, gender: 'male' | 'female'): Promise<boolean> {
    const ok = await this.session.createCharacter(nickname, gender);
    if (!ok) return false;
    await this.loadPanel();
    return true;
  }

  logout(): void {
    try {
      this.client.disconnect();
    } catch {
      /* 连接可能已关闭，忽略 */
    }
    this.session.logout();
    this.stopMetricsPolling();
  }

  /**
   * 并发拉取面板：item/equip/skill/economy/realm/quest/zone/idle/story/combat/map。
   * 每个域 Store 的 load() 内部已 try/catch；这里再兜一层 `.catch`，
   * 确保 `Promise.all` 绝不因单个域失败而 reject。
   *
   * 说明：`prop` 段没有读接口（只有 discard/generate 两个写 Action），
   * 其 load() 仅复位状态，故不在此列——道具数据由 item 域承担。
   */
  async loadPanel(): Promise<void> {
    await Promise.all([
      this.item.load().catch(() => undefined),
      this.equip.load().catch(() => undefined),
      this.skill.load().catch(() => undefined),
      this.economy.load().catch(() => undefined),
      this.realm.load().catch(() => undefined),
      this.quest.load().catch(() => undefined),
      this.zone.load().catch(() => undefined),
      this.idle.load().catch(() => undefined),
      this.story.load().catch(() => undefined),
      this.combat.load().catch(() => undefined),
      this.map.load().catch(() => undefined),
    ]);
  }

  /**
   * 订阅推送：idle / zone 段推送给对应 Store。
   *
   * `zone` 段的 `(100,5)` 是在线历练帧（P3.0）—— zone store 的 `handleNotification`
   * 只存帧与提示，不本地推进。
   */
  startNotificationRouting(): void {
    if (this.routingStarted) return;
    this.routingStarted = true;
    this.routingUnsubscribers.push(
      this.client.notifications.onAny((notification) => {
        this.routeNotification(notification as PushFrame);
      }),
    );
  }

  /**
   * 订阅页面可见性（P3.0 T2）：只上报「可见 / 不可见」，**不上报时长**。
   *
   * 切后台时 SDK 默认（`respectLifecycle`）会直接断开 WS —— 两条独立路径都让服务端
   * 停止推进。切回前台由 `onStateChange('online')` 或这里的回调纠正可见位。
   */
  startVisibilityReporting(): void {
    this.routingUnsubscribers.push(
      this.lifecycle.onVisibilityChange((hidden) => {
        this.zone.reportVisibility(!hidden);
      }),
    );
  }

  /** 释放：停轮询、退订推送、断开连接（幂等）。 */
  dispose(): void {
    this.stopMetricsPolling();
    for (const unsubscribe of this.routingUnsubscribers.splice(0)) {
      try {
        unsubscribe();
      } catch {
        /* 退订失败忽略 */
      }
    }
    this.routingStarted = false;
    try {
      this.client.disconnect();
    } catch {
      /* 忽略 */
    }
  }

  /** 登录/注册成功后连接 WS；失败只 toast，不阻止登录成功。 */
  private async connectAfterAuth(): Promise<void> {
    try {
      await this.client.connect();
      this.connection.refreshMetrics();
    } catch (error) {
      this.toast.fromError(error, '连接失败');
    }
  }

  private routeNotification(notification: PushFrame): void {
    if (notification.cmd === IDLE_CMD.cmd) {
      this.forwardNotification(this.idle, notification);
      return;
    }
    if (notification.cmd === ZONE_CMD.cmd) {
      this.forwardNotification(this.zone, notification);
    }
  }

  private forwardNotification(target: object, notification: PushFrame): void {
    const receiver = (target as { handleNotification?: (frame: PushFrame) => void })
      .handleNotification;
    if (typeof receiver === 'function') receiver.call(target, notification);
  }

  private startMetricsPolling(): void {
    if (this.autoRefreshMetricsMs <= 0) return;
    if (this.metricsTimer !== null) return;
    this.metricsTimer = setInterval(() => {
      this.connection.refreshMetrics();
    }, this.autoRefreshMetricsMs);
  }

  private stopMetricsPolling(): void {
    if (this.metricsTimer === null) return;
    clearInterval(this.metricsTimer);
    this.metricsTimer = null;
  }
}
