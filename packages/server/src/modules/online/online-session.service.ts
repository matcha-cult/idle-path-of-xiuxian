/**
 * 在线会话登记（P3.0 T2；R2 §4.2）。
 *
 * 「在线」的定义**不是**客户端上报的时长（可伪造），而是服务端能自己看到的两个事实：
 *
 * 1. **存在一条活着的 WS 会话** —— 框架的连接注册表（握手鉴权通过即登记，close / error /
 *    心跳踢除即注销）。表不可用时退化为「应用层心跳 `system.ping` 的 TTL」，
 *    即「最后一次 touch 在 {@link DEFAULT_HEARTBEAT_TTL_MS} 之内」；
 * 2. **页面可见** —— 客户端在 `visibilitychange` 时显式上报（`zone.visibility`）。
 *    缺省视为可见：没实现生命周期的老客户端 / e2e 客户端不会被误判为离线；
 *    真正的浏览器客户端切后台时会主动上报 `visible=false`，且 SDK 默认
 *    `respectLifecycle` 会直接断开 WS，两条独立路径都指向「不上报即不推进」。
 *
 * ⚠️ 本服务**只记录事实、不做业务判定**：tick 是否推进由 `OnlineExploreService` 决定。
 * 也**不接受任何时长类入参**（唯一的时间输入是服务端自己的时钟）。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { IONET_WS_SERVER } from '@nbb-ionet/extension-nestjs';

/** 应用层心跳 TTL：客户端 15s 一发，留 3 次容错（未挂连接注册表时的判活依据）。 */
export const DEFAULT_HEARTBEAT_TTL_MS = 45_000;

/** 连接注册表所需的最小结构（只依赖能力，不依赖框架具体类型）。 */
export interface OnlineConnectionRegistry {
  isLocalUser(userId: string): boolean;
  getLocalUserIds(): string[];
}

/** ionet WS 外部服的最小结构（`IONET_WS_SERVER` 的可选注入面）。 */
export interface OnlineWsServerLike {
  readonly connectionRegistry?: OnlineConnectionRegistry;
}

/**
 * 在线会话登记表。
 *
 * 手动构造即可单测（`new OnlineSessionService()` 走心跳 TTL 口径；
 * `new OnlineSessionService(fakeWsServer)` 走连接注册表口径）。
 */
@Injectable()
export class OnlineSessionService {
  /** `userId → 最近一次应用层心跳 / 显式上报的时刻`（ms）。 */
  private readonly lastSeenAt = new Map<number, number>();
  /** `userId → 页面是否可见`；缺省（无记录）视为可见。 */
  private readonly visible = new Map<number, boolean>();
  private readonly heartbeatTtlMs: number;
  private readonly now: () => number;

  constructor(
    @Optional() @Inject(IONET_WS_SERVER) private readonly wsServer: OnlineWsServerLike | null = null,
    options: { heartbeatTtlMs?: number; now?: () => number } = {},
  ) {
    this.heartbeatTtlMs = options.heartbeatTtlMs ?? DEFAULT_HEARTBEAT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /** 应用层心跳（`system.ping`）或任意鉴权交互 → 刷新活跃时刻。非法 userId（≤0）忽略。 */
  touch(userId: number, at: number = this.now()): void {
    if (!Number.isFinite(userId) || userId <= 0) return;
    this.lastSeenAt.set(Math.trunc(userId), at);
  }

  /**
   * 页面可见性上报。`visible=true` 同时刷新活跃时刻（切回前台也算活着的会话）；
   * `visible=false` 只改可见位，**不刷新活跃时刻**。
   */
  setVisible(userId: number, visible: boolean, at: number = this.now()): void {
    if (!Number.isFinite(userId) || userId <= 0) return;
    const id = Math.trunc(userId);
    this.visible.set(id, visible);
    if (visible) this.lastSeenAt.set(id, at);
  }

  /** 页面是否可见（无记录视为可见 —— 见类注释的口径）。 */
  isVisible(userId: number): boolean {
    return this.visible.get(Math.trunc(userId)) ?? true;
  }

  /** 会话是否活着（连接注册表优先；表不可用时回落到心跳 TTL）。 */
  isSessionAlive(userId: number, at: number = this.now()): boolean {
    const id = Math.trunc(userId);
    const registry = this.wsServer?.connectionRegistry;
    if (registry) return registry.isLocalUser(String(id));
    return this.touchedRecently(id, at);
  }

  /** **在线 = 活着的 WS 会话 + 页面可见**（R2 §4.2 的完整定义）。 */
  isOnline(userId: number, at: number = this.now()): boolean {
    if (!Number.isFinite(userId) || userId <= 0) return false;
    return this.isSessionAlive(userId, at) && this.isVisible(userId);
  }

  /**
   * 当前在线 userId 列表（tick 扫描入口；**去重**，同角色多会话只返回一次）。
   *
   * 连接注册表可用时以它为准（权威）；不可用时用「最近 touch 过的 userId」兜底。
   */
  onlineUserIds(at: number = this.now()): number[] {
    const registry = this.wsServer?.connectionRegistry;
    const candidates = registry
      ? registry.getLocalUserIds().map((raw) => Number(raw)).filter((id) => Number.isFinite(id) && id > 0)
      : [...this.lastSeenAt.keys()];
    const unique = new Set<number>();
    for (const id of candidates) {
      if (this.isOnline(id, at)) unique.add(id);
    }
    return [...unique];
  }

  /** 会话已断开的用户：清理内存登记（幂等）。 */
  forget(userId: number): void {
    const id = Math.trunc(userId);
    this.lastSeenAt.delete(id);
    this.visible.delete(id);
  }

  /** 清理超过 TTL 的活跃记录（防内存无界增长）。返回清理条数。 */
  sweep(at: number = this.now()): number {
    let removed = 0;
    for (const [id, seenAt] of [...this.lastSeenAt]) {
      if (at - seenAt > this.heartbeatTtlMs) {
        this.lastSeenAt.delete(id);
        this.visible.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /** 登记规模（运维 / 测试可见）。 */
  get size(): number {
    return this.lastSeenAt.size;
  }

  private touchedRecently(userId: number, at: number): boolean {
    const seenAt = this.lastSeenAt.get(userId);
    if (seenAt === undefined) return false;
    return at - seenAt <= this.heartbeatTtlMs;
  }
}
