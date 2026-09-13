/**
 * 在线历练 tick（P3.0 T3 骨架 / T4 结算 / T5 推送）。
 *
 * 职责边界（刻意划清）：
 * - **谁在线**：`OnlineSessionService`（活着的 WS 会话 + 页面可见）—— 本服务只问它要列表；
 * - **打没打赢 / 门槛多少**：`ZoneService.onlineContext`（既有 `floorRequirement` 公式）；
 * - **掉落怎么抽**：`CombatLogicService.settleKills`（既有辨宝法阵）；
 * - **涨层怎么落库**：`ZoneService.advanceFloor`（与 `challenge` 同表同口径）；
 * - **击败 Boss 解锁挂机**：`MapLogicService.onZoneFloorPassed`（既有 D2 钩子，幂等）；
 * - **推送怎么发**：`OnlineNotifyService`（既有 NotificationPort + 节流）；
 * - **本服务只做**：节拍、击杀速率→击杀数、层内累计、事件归纳。
 *
 * ⚠️ R2 §4.2 的两条硬红线：
 * 1. 客户端不本地涨层、不本地算产出 —— 所有帧都是**服务端算完的结果**；
 * 2. **不做任何形式的离线补算** —— tick 只处理「此刻在线」的角色；`floorKills` / 小数进位
 *    只存在内存里，角色一断线就停止累计（下次上线从上次的层进度继续，不补离线时间）。
 *
 * ⚠️ 层内击杀累计**刻意只放内存**（不落库）：它是「本次在线会话的临时进度」，
 * 落库会引入「离线期间它还在那儿」的歧义；进程重启后重新从 0 累计是本设计的预期代价。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { CharacterService } from '../../../character/character.service.js';
import { OnlineSessionService } from '../../../online/online-session.service.js';
import { CombatLogicService } from '../../combat/combat.logic.service.js';
import { MapLogicService } from '../../map/map.logic.service.js';
import { OnlineNotifyService } from './online-notify.service.js';
import { ZoneService } from './zone.service.js';
import { ONLINE_TICK, killRatePerSecond, killsForTick, powerRatio } from './online-tick.config.js';
import type { ZoneOnlineEvent, ZoneOnlineFrame, ZoneOnlineReason } from './online.types.js';
import type { ZoneOnlineContext } from './zone.types.js';

/** 每个在线角色的**会话内**进度（只存内存，进程重启即归零）。 */
export interface OnlineCharacterState {
  /** 本层已累计击杀（用于涨层判定与面板展示） */
  floorKills: number;
  /** 小数击杀进位（`r = 1.33` 时不丢那 0.33） */
  carry: number;
  /** 上一拍是否卡层（`stuck` 事件**边沿触发**，避免每 3 秒刷同一条提示） */
  stuck: boolean;
  /** 最近一次处理时刻（内存治理用） */
  lastSeenAt: number;
}

/** 一次 tick 的结果（日志 / 测试 / e2e 实测用）。 */
export interface OnlineTickReport {
  at: number;
  /** 该 tick 判定为在线的 userId 数 */
  onlineUsers: number;
  /** 实际处理（去重后）的角色数 */
  processed: number;
  /** 有在线会话但没有角色的 userId 数 */
  noCharacter: number;
}

@Injectable()
export class OnlineExploreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnlineExploreService.name);
  /** `characterId → 会话内进度` */
  private readonly states = new Map<number, OnlineCharacterState>();
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 重入保护：上一 tick 还没跑完就跳过本 tick（宁可少算一次，不并发写同一角色） */
  private running = false;
  private readonly now: () => number;

  constructor(
    private readonly onlineSessions: OnlineSessionService,
    private readonly characterService: CharacterService,
    private readonly zoneService: ZoneService,
    private readonly combatLogic: CombatLogicService,
    private readonly mapLogic: MapLogicService,
    @Optional() private readonly notifier: OnlineNotifyService | null = null,
    options: { now?: () => number } = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  /**
   * 受管定时器（P3.0 T3）。
   *
   * NestJS 侧没有引入 `@nestjs/schedule`（不是本仓依赖），因此自建受管 interval：
   * 在 `onModuleInit` 起、在 `onModuleDestroy` 停，与 Nest 生命周期绑定，不裸跑。
   */
  onModuleInit(): void {
    if (ONLINE_TICK.tickMs <= 0) {
      this.logger.warn('ONLINE_TICK.tickMs <= 0，在线历练 tick 已关闭');
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, ONLINE_TICK.tickMs);
    this.logger.log(`在线历练 tick 已启动：每 ${ONLINE_TICK.tickMs}ms 一次`);
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 单次节拍（定时器入口；异常不外抛，避免一个坏 tick 打死整个 interval）。 */
  async tick(at: number = this.now()): Promise<OnlineTickReport | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await this.runTick(at);
    } catch (error) {
      this.logger.error('在线历练 tick 失败：' + (error instanceof Error ? error.message : String(error)));
      return null;
    } finally {
      this.running = false;
    }
  }

  /**
   * 结算一拍：枚举在线角色 → 去重 → 逐个推进。
   *
   * **同一角色在多个会话同时在线只会推进一次**（`seen` 去重按 `characterId`，不按 userId）。
   */
  async runTick(at: number = this.now()): Promise<OnlineTickReport> {
    const userIds = this.onlineSessions.onlineUserIds(at);
    const seen = new Set<number>();
    let noCharacter = 0;
    for (const userId of userIds) {
      const character = await this.characterService.findByUserId(userId);
      if (!character) {
        noCharacter++;
        continue;
      }
      if (seen.has(character.id)) continue; // 同角色多会话：只推进一次
      seen.add(character.id);
      const frame = await this.tickCharacter(userId, character.id, character.realm, at);
      // 推送节流在 OnlineNotifyService 内：没内容不发、未到 pushEveryMs 合并
      if (frame !== null) this.notifier?.record(userId, character.id, frame, at);
    }
    this.pruneStates(at);
    return { at, onlineUsers: userIds.length, processed: seen.size, noCharacter };
  }

  /**
   * 页面可见性上报转发（P3.0 T2）：唯一登记处是 `OnlineSessionService`。
   * 本方法只是让 zone 门面不必再依赖第二个服务。
   */
  setVisibility(userId: number, visible: boolean, at: number = this.now()): void {
    this.onlineSessions.setVisible(userId, visible, at);
  }

  /** 当前内存里的会话进度（测试 / 面板读接口用）。 */
  stateOf(characterId: number): OnlineCharacterState | null {
    return this.states.get(characterId) ?? null;
  }

  /**
   * 面板读接口（`zone.online`）：给该角色此刻的**真实状态**（不消费产出摘要）。
   *
   * 离线时也返回一帧（`online=false`），面板据此显示「历练已暂停」而不是空白。
   */
  async snapshot(userId: number, at: number = this.now()): Promise<ZoneOnlineFrame> {
    const character = await this.characterService.findByUserId(userId);
    if (!character) return this.idleFrame('no_session');
    if (!this.onlineSessions.isOnline(userId, at)) {
      return this.idleFrame(this.onlineSessions.isSessionAlive(userId, at) ? 'hidden' : 'no_session');
    }
    const context = await this.zoneService.onlineContext(character.id, character.realm);
    if (!context) return this.idleFrame('no_realm');
    const node = await this.mapLogic.secretRealmNodeView(character.id, context.zoneCode);
    if (!node) return this.idleFrame('not_map_realm', context);
    return this.frameOf(context, node, this.ensureState(character.id, at));
  }

  /** 一个角色的一拍（T4：击杀 → 产出 → 涨层 → Boss 解锁）。 */
  protected async tickCharacter(
    _userId: number,
    characterId: number,
    realm: number,
    at: number,
  ): Promise<ZoneOnlineFrame | null> {
    const context = await this.zoneService.onlineContext(characterId, realm);
    if (!context) return null;
    let node = await this.mapLogic.secretRealmNodeView(characterId, context.zoneCode);
    if (!node) return null;
    const state = this.ensureState(characterId, at);

    // ===== 步 1：碾压比 → 本 tick 击杀数（含小数进位与单 tick 上限）=====
    const rate = killRatePerSecond(powerRatio(context.playerPower, context.floorRequirement));
    const { kills, carry } = killsForTick(rate, ONLINE_TICK.tickMs, state.carry);
    state.carry = carry;

    // ===== 步 2：产出走既有辨宝抽取（kills=0 时完全不打扰 DB）=====
    const settled =
      kills > 0
        ? await this.combatLogic.settleKills(characterId, context.unitCode, kills, {
            lingyunBonusFlat: context.lingyunBonusFlat,
            tierOffsetBonus: context.tierOffsetBonus,
            dropDrawBonus: context.dropDrawBonus,
          })
        : null;
    if (settled && !settled.ok) {
      // 单位配置错误 / 不可击杀等：本拍不推进，但不打断其他角色（tick 层已兜异常）
      this.logger.warn(
        `在线历练结算失败（角色 ${characterId}，单位 ${context.unitCode}）：` + settled.result.message,
      );
      return null;
    }
    const lingyunGained = settled && settled.ok ? settled.data.lingyunGained : 0;

    // ===== 步 3/4/6：层内累计 → 卡层不涨 / 达标涨层（Boss 层同规则：打不赢就原地刷）=====
    const events: ZoneOnlineEvent[] = [];
    const stuck = context.playerPower < context.floorRequirement;
    state.floorKills += kills;
    let current = context;
    let idleUnlocked = node.idleUnlocked;

    if (stuck) {
      // 边沿触发：只在「刚被打回卡层」时推一次，避免每 3 秒刷一条同样的提示。
      // `state.stuck` 只在**真正发出事件后**才置位 —— 否则第一拍恰好 kills=0（0.5 只/秒时
      // 每两秒才 1 只）就会把状态标成「已提示」，那条「战力不足」永远发不出去。
      if (kills > 0 && !state.stuck) {
        events.push('stuck');
        state.stuck = true;
      }
    } else {
      state.stuck = false;
    }
    if (!stuck && state.floorKills >= ONLINE_TICK.killsPerFloor && !context.cleared) {
      // 一拍最多涨一层：剩余击杀留在本层累计，下一拍继续。
      // 现实取值下不可能多涨（单 tick 上限 20 < killsPerFloor 30），这样写是为了
      // 避免在同一拍里手工重算新层的门槛 / 单位 / 层加成（重读一次就够）。
      state.floorKills -= ONLINE_TICK.killsPerFloor;
      const passedFloor = context.floor;
      const passedBoss = context.isBossFloor;
      const advanced = await this.zoneService.advanceFloor(characterId, context.zoneId, {
        floor: context.floor,
        bestFloor: context.bestFloor,
        maxFloor: context.maxFloor,
      });
      // ===== 步 5：Boss 层通过 → 既有钩子置位 idle_unlocked（幂等，重复击败不重复置位）=====
      const unlock = await this.mapLogic.onZoneFloorPassed(characterId, {
        zoneCode: context.zoneCode,
        floor: passedFloor,
        isBossFloor: passedBoss,
        cleared: advanced.cleared,
      });
      events.push(passedBoss ? 'boss_defeated' : 'floor_up');
      if (unlock.changed) events.push('idle_unlocked');
      idleUnlocked = idleUnlocked || unlock.changed;
      // 重读一次上下文：新层的门槛 / 单位 / Boss 标记 / 层加成全部由既有公式重算，
      // 本服务不复制任何一条派生规则。
      const next = await this.zoneService.onlineContext(characterId, realm);
      if (next) current = next;
      if (!current.cleared && current.isBossFloor) events.push('boss_floor');
      node = { ...node, idleUnlocked };
    }

    return this.frameOf(current, node, state, { kills, lingyunGained, events, idleUnlocked });
  }

  /** 取（或建）会话内进度。 */
  protected ensureState(characterId: number, at: number): OnlineCharacterState {
    let state = this.states.get(characterId);
    if (!state) {
      state = { floorKills: 0, carry: 0, stuck: false, lastSeenAt: at };
      this.states.set(characterId, state);
    }
    state.lastSeenAt = at;
    return state;
  }

  /** 组装一帧（`kills` / `lingyunGained` / `events` 等由调用方覆盖）。 */
  protected frameOf(
    context: ZoneOnlineContext,
    node: { nodeCode: string; nodeName: string; idleUnlocked: boolean },
    state: OnlineCharacterState,
    overrides: Partial<ZoneOnlineFrame> = {},
  ): ZoneOnlineFrame {
    const stuck = context.playerPower < context.floorRequirement;
    return {
      online: true,
      exploring: true,
      reason: 'ok',
      zone: { code: context.zoneCode, name: context.zoneName },
      nodeCode: node.nodeCode,
      nodeName: node.nodeName,
      floor: context.floor,
      maxFloor: context.maxFloor,
      bestFloor: context.bestFloor,
      cleared: context.cleared,
      isBossFloor: context.isBossFloor,
      playerPower: context.playerPower,
      floorRequirement: context.floorRequirement,
      floorKills: Math.floor(state.floorKills),
      killsPerFloor: ONLINE_TICK.killsPerFloor,
      stuck,
      shortfall: stuck ? Math.max(0, context.floorRequirement - context.playerPower) : 0,
      idleUnlocked: node.idleUnlocked,
      kills: 0,
      lingyunGained: 0,
      events: [],
      tickMs: ONLINE_TICK.tickMs,
      pushEveryMs: ONLINE_TICK.pushEveryMs,
      ...overrides,
    };
  }

  /** 离线 / 无秘境 / 非秘境峰时的空帧。 */
  protected idleFrame(reason: ZoneOnlineReason, context?: ZoneOnlineContext): ZoneOnlineFrame {
    return {
      online: reason !== 'no_session' && reason !== 'hidden',
      exploring: false,
      reason,
      zone: context ? { code: context.zoneCode, name: context.zoneName } : null,
      nodeCode: null,
      nodeName: null,
      floor: context?.floor ?? 0,
      maxFloor: context?.maxFloor ?? 0,
      bestFloor: context?.bestFloor ?? 0,
      cleared: context?.cleared ?? false,
      isBossFloor: false,
      playerPower: context?.playerPower ?? 0,
      floorRequirement: context?.floorRequirement ?? 0,
      floorKills: 0,
      killsPerFloor: ONLINE_TICK.killsPerFloor,
      stuck: false,
      shortfall: 0,
      idleUnlocked: false,
      kills: 0,
      lingyunGained: 0,
      events: [],
      tickMs: ONLINE_TICK.tickMs,
      pushEveryMs: ONLINE_TICK.pushEveryMs,
    };
  }

  /** 内存治理：超过 30 分钟没被 tick 碰过的角色状态丢掉（离线期间不保留任何累计）。 */
  private pruneStates(at: number): number {
    const ttl = ONLINE_TICK.tickMs > 0 ? 30 * 60_000 : 0;
    let removed = 0;
    for (const [characterId, state] of [...this.states]) {
      if (at - state.lastSeenAt > ttl) {
        this.states.delete(characterId);
        removed++;
      }
    }
    return removed;
  }
}
