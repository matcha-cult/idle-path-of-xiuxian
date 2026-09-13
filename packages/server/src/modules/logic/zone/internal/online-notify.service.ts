/**
 * 在线历练推送（P3.0 T5；任务书 §4）。
 *
 * 三条纪律：
 * 1. **走既有 WS 推送机制**：只依赖 `NotificationPort`（对外服端口），推送信封由框架补
 *    `kind: 'notification'`（业务不得自造形状，见 `AGENTS.local.md` §10 坑位 13）；
 * 2. **按 `pushEveryMs` 节流**：不每 tick 推一条；同一角色的多拍合并成**一帧摘要**
 *    （击杀数求和、灵韵求和、事件取并集，快照字段取最新）；
 * 3. **没内容不发**：`kills === 0` 且无事件时完全静默，避免站着不动也每 3 秒收一条空帧。
 *
 * 路由：`cmd = ZONE_CMD.cmd` / `subCmd = ZONE_CMD.online`（前端 `root-store` 已把
 * `ZONE_CMD.cmd` 的推送转给 zone store）。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ZONE_CMD } from '../../../../ionet/cmd.js';
import { NOTIFICATION_PORT, type NotificationPort } from '../../../../common/ports/notification.port.js';
import { ONLINE_TICK } from './online-tick.config.js';
import type { ZoneOnlineEvent, ZoneOnlineFrame } from './online.types.js';

interface PendingFrame {
  userId: number;
  frame: ZoneOnlineFrame;
}

@Injectable()
export class OnlineNotifyService {
  private readonly pending = new Map<number, PendingFrame>();
  private readonly lastSentAt = new Map<number, number>();
  private attempts = 0;
  private hits = 0;

  constructor(
    @Optional() @Inject(NOTIFICATION_PORT) private readonly port: NotificationPort | null = null,
  ) {}

  /** 推送**尝试**次数（含未命中在线连接；节流验证的判据）。 */
  get sentCount(): number {
    return this.attempts;
  }

  /** 至少命中一个在线连接的次数。 */
  get deliveredCount(): number {
    return this.hits;
  }

  /** 当前积压（还没到推送时刻）的角色数。 */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * 记一帧。返回**本次是否真的发出了推送**。
   *
   * 合并规则见类注释；`at` 由调用方给（与 tick 同一时钟，便于确定性测试）。
   */
  record(userId: number, characterId: number, frame: ZoneOnlineFrame, at: number): boolean {
    if (frame.kills === 0 && frame.events.length === 0) return false;
    const previous = this.pending.get(characterId)?.frame;
    const merged = previous ? this.merge(previous, frame) : frame;
    const lastSentAt = this.lastSentAt.get(characterId);
    const due = lastSentAt === undefined || at - lastSentAt >= ONLINE_TICK.pushEveryMs;
    if (!due) {
      this.pending.set(characterId, { userId, frame: merged });
      return false;
    }
    return this.send(userId, characterId, merged, at);
  }

  /** 立刻发出某角色积压的帧（测试 / 关服收尾 / 手动刷新）。 */
  flush(characterId: number, at: number): boolean {
    const pending = this.pending.get(characterId);
    if (!pending) return false;
    return this.send(pending.userId, characterId, pending.frame, at);
  }

  /** 丢掉某角色的积压与节流时刻（角色离线 / 会话结束时调用）。 */
  forget(characterId: number): void {
    this.pending.delete(characterId);
    this.lastSentAt.delete(characterId);
  }

  private send(userId: number, characterId: number, frame: ZoneOnlineFrame, at: number): boolean {
    this.pending.delete(characterId);
    this.lastSentAt.set(characterId, at);
    this.attempts++;
    const delivered =
      this.port?.sendTo(userId, {
        cmd: ZONE_CMD.cmd,
        subCmd: ZONE_CMD.online,
        data: frame,
      }) ?? false;
    if (delivered) this.hits++;
    return true;
  }

  /** 合并两帧：快照取最新，产出求和，事件保序取并集。 */
  private merge(previous: ZoneOnlineFrame, next: ZoneOnlineFrame): ZoneOnlineFrame {
    const events: ZoneOnlineEvent[] = [...previous.events];
    for (const event of next.events) {
      if (!events.includes(event)) events.push(event);
    }
    return {
      ...next,
      kills: previous.kills + next.kills,
      lingyunGained: previous.lingyunGained + next.lingyunGained,
      events,
    };
  }
}
