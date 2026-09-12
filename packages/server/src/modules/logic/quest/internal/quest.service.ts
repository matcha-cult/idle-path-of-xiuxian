/**
 * 任务服务（P6）：主线任务自动触发 / 无状态目标评估 / 完成与奖励发放（幂等）
 *
 * - 触发：trigger.realm（最低境界）+ trigger.requires（前置已完成）双条件，满足即 active
 * - 目标：从 characters / game_zone_progress / game_items / game_learned_skills 实时计算（无计数器）
 * - 完成：写入 game_quest_progress（ON CONFLICT DO NOTHING，插入成功才算新完成）
 * - 发奖：completed 且 rewards_granted=false 的行统一领取；发奖成功后置 true（失败可重试，不丢奖）
 */
import { Injectable } from '@nestjs/common';
import { CharacterService } from '../../../character/character.service.js';
import { DatabaseService } from '../../../database/database.service.js';
import { GameDatabaseService } from '../../../game/game-database.service.js';
import { StatService } from '../../../game/stat/stat.service.js';
import {
  type FailResult,
  type ObjectiveProgress,
  type QuestContext,
  type QuestDefRow,
  type QuestObjective,
  type QuestProgressRow,
  type QuestRewards,
  type QuestTrigger,
  fail,
} from './quest.types.js';

interface MergedProgressRow extends QuestProgressRow {
  def_rewards: string;
  def_name: string;
}

@Injectable()
export class QuestService {
  constructor(
    private readonly gameDb: GameDatabaseService,
    private readonly userDb: DatabaseService,
    private readonly characterService: CharacterService,
    private readonly statService: StatService,
  ) {}

  private async resolveCharacter(userId: number) {
    const character = await this.characterService.findByUserId(userId);
    if (!character) return { error: fail('CHARACTER_NOT_FOUND', '尚未创建角色') as FailResult };
    return { character };
  }

  private parseJson<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private async loadDefs(): Promise<QuestDefRow[]> {
    const rows = await this.gameDb.query<QuestDefRow>('SELECT * FROM game_quest_defs ORDER BY order_index, id');
    return rows.rows;
  }

  private async loadProgress(characterId: number): Promise<QuestProgressRow[]> {
    const rows = await this.gameDb.query<QuestProgressRow>(
      'SELECT * FROM game_quest_progress WHERE character_id = $1',
      [characterId],
    );
    return rows.rows;
  }

  private async loadContext(characterId: number, realm: number, lingyun: number, completed: Set<string>): Promise<QuestContext> {
    const [zoneRows, itemCount, skillCount, counters] = await Promise.all([
      this.gameDb.query<{ code: string; best_floor: number; cleared: boolean }>(
        'SELECT z.code, p.best_floor, p.cleared FROM game_zone_progress p JOIN game_zones z ON z.id = p.zone_id WHERE p.character_id = $1',
        [characterId],
      ),
      this.gameDb.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM game_items WHERE character_id = $1', [characterId]),
      this.gameDb.query<{ c: string }>(
        'SELECT COUNT(*)::text AS c FROM game_learned_skills WHERE character_id = $1',
        [characterId],
      ),
      this.statService.readAll(characterId),
    ]);
    const zones = new Map<string, { bestFloor: number; cleared: boolean }>();
    for (const row of zoneRows.rows) {
      zones.set(row.code, { bestFloor: Number(row.best_floor), cleared: Boolean(row.cleared) });
    }
    return {
      realm,
      lingyun,
      ownItems: Number(itemCount.rows[0] ? itemCount.rows[0].c : 0),
      learnedSkills: Number(skillCount.rows[0] ? skillCount.rows[0].c : 0),
      zones,
      completed,
      counters,
    };
  }

  private compare(current: number, target: number): { current: number; done: boolean } {
    return { current, done: current >= target };
  }

  private evalObjective(objective: QuestObjective, ctx: QuestContext): { current: number; done: boolean } {
    switch (objective.type) {
      case 'reach_realm':
        return this.compare(ctx.realm, objective.value ?? 1);
      case 'zone_best_floor': {
        const zone = ctx.zones.get(objective.key ?? '');
        return this.compare(zone ? zone.bestFloor : 0, objective.value ?? 1);
      }
      case 'zone_cleared': {
        const zone = ctx.zones.get(objective.key ?? '');
        const done = Boolean(zone && zone.cleared);
        return { current: done ? 1 : 0, done };
      }
      case 'own_items':
        return this.compare(ctx.ownItems, objective.value ?? 1);
      case 'learn_skills':
        return this.compare(ctx.learnedSkills, objective.value ?? 1);
      case 'lingyun':
        return this.compare(ctx.lingyun, objective.value ?? 1);
      case 'kill_total':
        return this.compare(ctx.counters.get('kill_total') ?? 0, objective.value ?? 1);
      case 'kill_unit':
        return this.compare(ctx.counters.get('kill:' + (objective.key ?? '')) ?? 0, objective.value ?? 1);
      case 'breakthrough_total':
        return this.compare(ctx.counters.get('breakthrough_total') ?? 0, objective.value ?? 1);
      case 'craft_total':
        return this.compare(ctx.counters.get('craft_total') ?? 0, objective.value ?? 1);
      default:
        return { current: 0, done: false };
    }
  }

  private objectiveProgress(def: QuestDefRow, ctx: QuestContext): ObjectiveProgress[] {
    const objectives = this.parseJson<QuestObjective[]>(def.objectives, []);
    return objectives.map((objective) => {
      const result = this.evalObjective(objective, ctx);
      return {
        type: objective.type,
        key: objective.key,
        value: objective.value,
        current: result.current,
        done: result.done,
        desc: objective.desc ?? '',
      };
    });
  }

  private isTriggered(def: QuestDefRow, ctx: QuestContext): boolean {
    const trigger = this.parseJson<QuestTrigger>(def.trigger_cond, {});
    if ((trigger.realm ?? 1) > ctx.realm) return false;
    const requires = trigger.requires ?? [];
    return requires.every((code) => ctx.completed.has(code));
  }

  async list(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const [defs, progressRows] = await Promise.all([this.loadDefs(), this.loadProgress(character.id)]);
    const completed = new Set(progressRows.filter((r) => r.status === 'completed').map((r) => r.quest_code));
    const ctx = await this.loadContext(character.id, character.realm, character.lingyun, completed);
    const progressByCode = new Map(progressRows.map((r) => [r.quest_code, r]));
    const quests = defs.map((def) => {
      const row = progressByCode.get(def.code);
      const isCompleted = row ? row.status === 'completed' : false;
      const triggered = this.isTriggered(def, ctx);
      const objectives = this.objectiveProgress(def, ctx);
      const status = isCompleted ? 'completed' : triggered ? 'active' : 'locked';
      return {
        code: def.code,
        chapter: def.chapter,
        name: def.name,
        orderIndex: def.order_index,
        status,
        claimable: status === 'active' && objectives.length > 0 && objectives.every((o) => o.done),
        objectives,
      };
    });
    return {
      success: true,
      message: '获取任务列表成功',
      data: { total: quests.length, completed: quests.filter((q) => q.status === 'completed').length, quests },
    };
  }

  async detail(userId: number, code: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const defs = await this.loadDefs();
    const def = defs.find((d) => d.code === code);
    if (!def) return fail('QUEST_NOT_FOUND', '任务不存在：' + code);
    const progressRows = await this.loadProgress(character.id);
    const completed = new Set(progressRows.filter((r) => r.status === 'completed').map((r) => r.quest_code));
    const ctx = await this.loadContext(character.id, character.realm, character.lingyun, completed);
    const row = progressRows.find((r) => r.quest_code === code);
    const isCompleted = row ? row.status === 'completed' : false;
    const triggered = this.isTriggered(def, ctx);
    const objectives = this.objectiveProgress(def, ctx);
    const status = isCompleted ? 'completed' : triggered ? 'active' : 'locked';
    return {
      success: true,
      message: '获取任务详情成功',
      data: {
        quest: {
          code: def.code,
          chapter: def.chapter,
          name: def.name,
          orderIndex: def.order_index,
          status,
          claimable: status === 'active' && objectives.length > 0 && objectives.every((o) => o.done),
          objectives,
          trigger: this.parseJson<QuestTrigger>(def.trigger_cond, {}),
          rewards: this.parseJson<QuestRewards>(def.rewards, {}),
          dialogues: this.parseJson<Record<string, string> | null>(def.dialogues, null),
          nextQuest: def.next_quest,
          completedAt: row ? row.completed_at : null,
        },
      },
    };
  }

  /** 供章节模块复用的奖励发放（单次 bundle） */
  async grantRewardBundle(characterId: number, rewards: QuestRewards): Promise<void> {
    await this.applyBundle(characterId, rewards);
  }

  private async applyBundle(characterId: number, rewards: QuestRewards): Promise<void> {
    const lingyun = rewards.lingyun ?? 0;
    const spiritStones = rewards.spiritStones ?? 0;
    const jadeSlips = rewards.jadeSlips ?? 0;
    if (lingyun > 0 || spiritStones > 0 || jadeSlips > 0) {
      await this.userDb.query(
        'UPDATE characters SET lingyun = lingyun + $1, spirit_stones = spirit_stones + $2, jade_slips = jade_slips + $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        [lingyun, spiritStones, jadeSlips, characterId],
      );
    }
    for (const [code, amount] of Object.entries(rewards.currencies ?? {})) {
      await this.gameDb.query(
        'INSERT INTO game_wallets (character_id, currency_code, amount) VALUES ($1, $2, $3) ON CONFLICT (character_id, currency_code) DO UPDATE SET amount = game_wallets.amount + EXCLUDED.amount, updated_at = CURRENT_TIMESTAMP',
        [characterId, code, Number(amount)],
      );
    }
    for (const [code, amount] of Object.entries(rewards.essences ?? {})) {
      await this.gameDb.query(
        'INSERT INTO game_essence_inventory (character_id, essence_id, count) SELECT $1, id, $3 FROM game_essences WHERE code = $2 ON CONFLICT (character_id, essence_id) DO UPDATE SET count = game_essence_inventory.count + EXCLUDED.count, updated_at = CURRENT_TIMESTAMP',
        [characterId, code, Number(amount)],
      );
    }
  }

  async sync(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const [defs, progressRows] = await Promise.all([this.loadDefs(), this.loadProgress(character.id)]);
    const completed = new Set(progressRows.filter((r) => r.status === 'completed').map((r) => r.quest_code));
    const ctx = await this.loadContext(character.id, character.realm, character.lingyun, completed);

    const newlyCompleted: { code: string; name: string; rewards: QuestRewards }[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const def of defs) {
        if (completed.has(def.code)) continue;
        if (!this.isTriggered(def, ctx)) continue;
        const objectives = this.parseJson<QuestObjective[]>(def.objectives, []);
        if (!objectives.every((o) => this.evalObjective(o, ctx).done)) continue;
        const inserted = await this.gameDb.query<{ id: number }>(
          "INSERT INTO game_quest_progress (character_id, quest_code, status, objectives, completed_at, rewards_granted) VALUES ($1, $2, 'completed', $3, CURRENT_TIMESTAMP, FALSE) ON CONFLICT (character_id, quest_code) DO NOTHING RETURNING id",
          [character.id, def.code, JSON.stringify(objectives)],
        );
        completed.add(def.code);
        if ((inserted.rowCount ?? 0) === 0) continue;
        newlyCompleted.push({ code: def.code, name: def.name, rewards: this.parseJson<QuestRewards>(def.rewards, {}) });
        changed = true;
      }
    }

    const pending = await this.gameDb.query<MergedProgressRow>(
      "SELECT p.*, d.rewards AS def_rewards, d.name AS def_name FROM game_quest_progress p JOIN game_quest_defs d ON d.code = p.quest_code WHERE p.character_id = $1 AND p.status = 'completed' AND p.rewards_granted = FALSE",
      [character.id],
    );
    const currencies = new Map<string, number>();
    const essences = new Map<string, number>();
    let lingyun = 0;
    let spiritStones = 0;
    let jadeSlips = 0;
    const pendingIds: number[] = [];
    const granted: { code: string; name: string; rewards: QuestRewards }[] = [];
    for (const row of pending.rows) {
      const rewards = this.parseJson<QuestRewards>(row.def_rewards, {});
      lingyun += rewards.lingyun ?? 0;
      spiritStones += rewards.spiritStones ?? 0;
      jadeSlips += rewards.jadeSlips ?? 0;
      for (const [code, count] of Object.entries(rewards.currencies ?? {})) {
        currencies.set(code, (currencies.get(code) ?? 0) + Number(count));
      }
      for (const [code, count] of Object.entries(rewards.essences ?? {})) {
        essences.set(code, (essences.get(code) ?? 0) + Number(count));
      }
      pendingIds.push(Number(row.id));
      granted.push({ code: row.quest_code, name: row.def_name, rewards });
    }

    if (pendingIds.length > 0) {
      await this.applyBundle(character.id, {
        lingyun,
        spiritStones,
        jadeSlips,
        currencies: Object.fromEntries(currencies),
        essences: Object.fromEntries(essences),
      });
      await this.gameDb.query(
        'UPDATE game_quest_progress SET rewards_granted = TRUE WHERE id = ANY($1::int[])',
        [pendingIds],
      );
    }

    const currencyTotals: Record<string, number> = {};
    for (const [k, v] of currencies) currencyTotals[k] = v;
    const essenceTotals: Record<string, number> = {};
    for (const [k, v] of essences) essenceTotals[k] = v;

    return {
      success: true,
      message: '任务同步完成：新完成 ' + newlyCompleted.length + ' 项',
      data: {
        completedCount: newlyCompleted.length,
        completed: newlyCompleted,
        granted,
        totals: { lingyun, spiritStones, jadeSlips, currencies: currencyTotals, essences: essenceTotals },
      },
    };
  }
}
