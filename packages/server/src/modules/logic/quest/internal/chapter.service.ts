/**
 * 章节服务（P7）：章节解锁链 / 完成判定 / 奖励发放（幂等）
 *
 * - 解锁：realm ≥ min_realm 且（无前置 或 前置章节 completed）
 * - 完成：章节 quest_end_code（收尾任务）在 game_quest_progress 中 completed
 * - 发奖：写 game_chapter_progress（ON CONFLICT DO NOTHING）→ 复用 QuestService.grantRewardBundle → 置 rewards_granted
 */
import { Injectable } from '@nestjs/common';
import { CharacterService } from '../../../character/character.service.js';
import { GameDatabaseService } from '../../../game/game-database.service.js';
import { QuestService } from './quest.service.js';
import {
  type ChapterProgressRow,
  type ChapterRow,
  type FailResult,
  type QuestProgressRow,
  type QuestRewards,
  fail,
} from './quest.types.js';

interface ChapterGrantRow extends ChapterProgressRow {
  def_rewards: string;
  def_name: string;
  def_code: string;
}

@Injectable()
export class ChapterService {
  constructor(
    private readonly gameDb: GameDatabaseService,
    private readonly characterService: CharacterService,
    private readonly questService: QuestService,
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

  private async loadChapters(): Promise<ChapterRow[]> {
    const rows = await this.gameDb.query<ChapterRow>('SELECT * FROM game_chapters ORDER BY order_index, id');
    return rows.rows;
  }

  private async loadChapterProgress(characterId: number): Promise<ChapterProgressRow[]> {
    const rows = await this.gameDb.query<ChapterProgressRow>(
      'SELECT * FROM game_chapter_progress WHERE character_id = $1',
      [characterId],
    );
    return rows.rows;
  }

  private async loadQuestProgress(characterId: number): Promise<QuestProgressRow[]> {
    const rows = await this.gameDb.query<QuestProgressRow>(
      'SELECT * FROM game_quest_progress WHERE character_id = $1',
      [characterId],
    );
    return rows.rows;
  }

  private unlockInfo(chapter: ChapterRow, realm: number, completedChapters: Set<string>) {
    const realmOk = realm >= chapter.min_realm;
    const chainOk = !chapter.requires_chapter || completedChapters.has(chapter.requires_chapter);
    const reason: 'ok' | 'realm' | 'prev' = !realmOk ? 'realm' : !chainOk ? 'prev' : 'ok';
    return { unlocked: realmOk && chainOk, reason };
  }

  async list(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const [chapters, chapterProgress, questProgress, questDefs] = await Promise.all([
      this.loadChapters(),
      this.loadChapterProgress(character.id),
      this.loadQuestProgress(character.id),
      this.gameDb.query<{ code: string; chapter: number }>('SELECT code, chapter FROM game_quest_defs'),
    ]);
    const completedChapters = new Set(
      chapterProgress.filter((r) => r.status === 'completed').map((r) => String(r.chapter_id)),
    );
    const completedChapterCodes = new Set(
      chapters.filter((c) => completedChapters.has(String(c.id))).map((c) => c.code),
    );
    const completedQuests = new Set(questProgress.filter((r) => r.status === 'completed').map((r) => r.quest_code));
    const byChapter = new Map<number, { total: number; completed: number }>();
    for (const def of questDefs.rows) {
      const entry = byChapter.get(Number(def.chapter)) ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (completedQuests.has(def.code)) entry.completed += 1;
      byChapter.set(Number(def.chapter), entry);
    }
    const views = chapters.map((c) => {
      const info = this.unlockInfo(c, character.realm, completedChapterCodes);
      const done = completedChapters.has(String(c.id));
      const summary = byChapter.get(Number(c.chapter)) ?? { total: 0, completed: 0 };
      return {
        code: c.code,
        chapter: c.chapter,
        name: c.name,
        theme: c.theme,
        minRealm: c.min_realm,
        zoneCode: c.zone_code,
        requiresChapter: c.requires_chapter,
        orderIndex: c.order_index,
        unlocked: info.unlocked,
        unlockedReason: info.reason,
        completed: done,
        quests: { total: summary.total, completed: summary.completed },
      };
    });
    const current = views.find((v) => v.unlocked && !v.completed) ?? views[views.length - 1];
    return {
      success: true,
      message: '获取章节列表成功',
      data: { total: views.length, currentChapter: current ? current.chapter : null, chapters: views },
    };
  }

  async detail(userId: number, key: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const chapters = await this.loadChapters();
    const numeric = Number(key);
    const chapter = chapters.find((c) => c.code === key || (Number.isInteger(numeric) && c.chapter === numeric));
    if (!chapter) return fail('CHAPTER_NOT_FOUND', '章节不存在：' + key);

    const [chapterProgress, questDefs, zoneRows, questListResult] = await Promise.all([
      this.loadChapterProgress(character.id),
      this.gameDb.query<{ code: string; name: string; order_index: number }>(
        'SELECT code, name, order_index FROM game_quest_defs WHERE chapter = $1 ORDER BY order_index, id',
        [chapter.chapter],
      ),
      this.gameDb.query<{ code: string; name: string }>('SELECT code, name FROM game_zones WHERE code = $1', [chapter.zone_code]),
      this.questService.list(userId),
    ]);
    const completedChapterCodes = new Set<string>();
    for (const c of chapters) {
      if (chapterProgress.some((r) => String(r.chapter_id) === String(c.id) && r.status === 'completed')) {
        completedChapterCodes.add(c.code);
      }
    }
    const done = chapterProgress.some(
      (r) => String(r.chapter_id) === String(chapter.id) && r.status === 'completed',
    );
    const info = this.unlockInfo(chapter, character.realm, completedChapterCodes);
    const statusByCode = new Map<string, string>();
    const questData = questListResult.data as { quests?: { code: string; status: string }[] } | undefined;
    for (const q of questData && questData.quests ? questData.quests : []) statusByCode.set(q.code, q.status);
    return {
      success: true,
      message: '获取章节详情成功',
      data: {
        chapter: {
          code: chapter.code,
          chapter: chapter.chapter,
          name: chapter.name,
          theme: chapter.theme,
          minRealm: chapter.min_realm,
          zone: zoneRows.rows[0] ? { code: zoneRows.rows[0].code, name: zoneRows.rows[0].name } : null,
          unlocked: info.unlocked,
          unlockedReason: info.reason,
          completed: done,
          requiresChapter: chapter.requires_chapter,
          rewards: this.parseJson<QuestRewards>(chapter.rewards, {}),
          dialogues: this.parseJson<Record<string, string> | null>(chapter.dialogues, null),
          quests: questDefs.rows.map((q) => ({
            code: q.code,
            name: q.name,
            status: statusByCode.get(q.code) ?? 'locked',
          })),
        },
      },
    };
  }

  async sync(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const [chapters, chapterProgress, questProgress] = await Promise.all([
      this.loadChapters(),
      this.loadChapterProgress(character.id),
      this.loadQuestProgress(character.id),
    ]);
    const completedChapterCodes = new Set<string>();
    for (const c of chapters) {
      if (chapterProgress.some((r) => String(r.chapter_id) === String(c.id) && r.status === 'completed')) {
        completedChapterCodes.add(c.code);
      }
    }
    const completedQuests = new Set(questProgress.filter((r) => r.status === 'completed').map((r) => r.quest_code));

    const newlyCompleted: { code: string; name: string; rewards: QuestRewards }[] = [];
    for (const chapter of chapters) {
      if (completedChapterCodes.has(chapter.code)) continue;
      const info = this.unlockInfo(chapter, character.realm, completedChapterCodes);
      if (!info.unlocked) continue;
      if (!completedQuests.has(chapter.quest_end_code)) continue;
      const inserted = await this.gameDb.query<{ id: number }>(
        "INSERT INTO game_chapter_progress (character_id, chapter_id, status, completed_at, rewards_granted) VALUES ($1, $2, 'completed', CURRENT_TIMESTAMP, FALSE) ON CONFLICT (character_id, chapter_id) DO NOTHING RETURNING id",
        [character.id, chapter.id],
      );
      completedChapterCodes.add(chapter.code);
      if ((inserted.rowCount ?? 0) === 0) continue;
      newlyCompleted.push({ code: chapter.code, name: chapter.name, rewards: this.parseJson<QuestRewards>(chapter.rewards, {}) });
    }

    const pending = await this.gameDb.query<ChapterGrantRow>(
      "SELECT p.*, c.rewards AS def_rewards, c.name AS def_name, c.code AS def_code FROM game_chapter_progress p JOIN game_chapters c ON c.id = p.chapter_id WHERE p.character_id = $1 AND p.status = 'completed' AND p.rewards_granted = FALSE",
      [character.id],
    );
    const totals = { lingyun: 0, spiritStones: 0, jadeSlips: 0, currencies: {} as Record<string, number>, essences: {} as Record<string, number> };
    const granted: { code: string; name: string; rewards: QuestRewards }[] = [];
    const pendingIds: number[] = [];
    for (const row of pending.rows) {
      const rewards = this.parseJson<QuestRewards>(row.def_rewards, {});
      totals.lingyun += rewards.lingyun ?? 0;
      totals.spiritStones += rewards.spiritStones ?? 0;
      totals.jadeSlips += rewards.jadeSlips ?? 0;
      for (const [code, n] of Object.entries(rewards.currencies ?? {})) {
        totals.currencies[code] = (totals.currencies[code] ?? 0) + Number(n);
      }
      for (const [code, n] of Object.entries(rewards.essences ?? {})) {
        totals.essences[code] = (totals.essences[code] ?? 0) + Number(n);
      }
      pendingIds.push(Number(row.id));
      granted.push({ code: row.def_code, name: row.def_name, rewards });
    }
    if (pendingIds.length > 0) {
      for (const row of pending.rows) {
        await this.questService.grantRewardBundle(character.id, this.parseJson<QuestRewards>(row.def_rewards, {}));
      }
      await this.gameDb.query(
        'UPDATE game_chapter_progress SET rewards_granted = TRUE WHERE id = ANY($1::int[])',
        [pendingIds],
      );
    }

    return {
      success: true,
      message: '章节同步完成：新完成 ' + newlyCompleted.length + ' 章',
      data: {
        completedCount: newlyCompleted.length,
        completed: newlyCompleted,
        granted,
        totals,
      },
    };
  }
}
