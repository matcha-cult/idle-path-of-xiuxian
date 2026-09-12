/**
 * 演出编排服务（P7.2）：章节/任务剧本节点 + 已读状态
 *
 * 节点键：chapter:<code>:intro|outro、quest:<code>:start|done
 * 已读：game_story_seen(character_id, node_key)
 */
import { Injectable } from '@nestjs/common';
import { CharacterService } from '../../character/character.service.js';
import { GameDatabaseService } from '../game-database.service.js';
import { QuestService } from '../quest/quest.service.js';
import { type ChapterRow, type FailResult, type QuestDefRow, fail } from '../quest/quest.types.js';

interface StoryNode {
  nodeKey: string;
  type: string;
  text: string;
  seen: boolean;
  questCode?: string;
  questStatus?: string;
}

@Injectable()
export class StoryService {
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

  private async seenSet(characterId: number): Promise<Set<string>> {
    const rows = await this.gameDb.query<{ node_key: string }>(
      'SELECT node_key FROM game_story_seen WHERE character_id = $1',
      [characterId],
    );
    return new Set(rows.rows.map((r) => r.node_key));
  }

  private async loadChapters(): Promise<ChapterRow[]> {
    const rows = await this.gameDb.query<ChapterRow>('SELECT * FROM game_chapters ORDER BY order_index, id');
    return rows.rows;
  }

  private async questStatuses(userId: number): Promise<Map<string, string>> {
    const result = await this.questService.list(userId);
    const map = new Map<string, string>();
    const data = result.data as { quests?: { code: string; status: string }[] } | undefined;
    for (const q of data && data.quests ? data.quests : []) map.set(q.code, q.status);
    return map;
  }

  private pushQuestNodes(
    nodes: StoryNode[],
    def: QuestDefRow,
    statuses: Map<string, string>,
    seen: Set<string>,
  ): void {
    const dialogues = this.parseJson<Record<string, string>>(def.dialogues, {});
    const status = statuses.get(def.code) ?? 'locked';
    if (dialogues.start) {
      const nodeKey = 'quest:' + def.code + ':start';
      nodes.push({ nodeKey, type: 'quest_start', questCode: def.code, text: dialogues.start, questStatus: status, seen: seen.has(nodeKey) });
    }
    if (dialogues.done) {
      const nodeKey = 'quest:' + def.code + ':done';
      nodes.push({ nodeKey, type: 'quest_done', questCode: def.code, text: dialogues.done, questStatus: status, seen: seen.has(nodeKey) });
    }
  }

  async chapterStory(userId: number, key: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const chapters = await this.loadChapters();
    const numeric = Number(key);
    const chapter = chapters.find((c) => c.code === key || (Number.isInteger(numeric) && c.chapter === numeric));
    if (!chapter) return fail('CHAPTER_NOT_FOUND', '章节不存在：' + key);
    const [questDefs, statuses, seen] = await Promise.all([
      this.gameDb.query<QuestDefRow>('SELECT * FROM game_quest_defs WHERE chapter = $1 ORDER BY order_index, id', [chapter.chapter]),
      this.questStatuses(userId),
      this.seenSet(character.id),
    ]);
    const nodes: StoryNode[] = [];
    const chapterDialogues = this.parseJson<Record<string, string>>(chapter.dialogues, {});
    if (chapterDialogues.intro) {
      const nodeKey = 'chapter:' + chapter.code + ':intro';
      nodes.push({ nodeKey, type: 'chapter_intro', text: chapterDialogues.intro, seen: seen.has(nodeKey) });
    }
    for (const def of questDefs.rows) this.pushQuestNodes(nodes, def, statuses, seen);
    if (chapterDialogues.outro) {
      const nodeKey = 'chapter:' + chapter.code + ':outro';
      nodes.push({ nodeKey, type: 'chapter_outro', text: chapterDialogues.outro, seen: seen.has(nodeKey) });
    }
    return {
      success: true,
      message: '获取章节剧本成功',
      data: { chapter: { code: chapter.code, name: chapter.name, chapter: chapter.chapter }, nodes },
    };
  }

  async questStory(userId: number, code: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const defRows = await this.gameDb.query<QuestDefRow>('SELECT * FROM game_quest_defs WHERE code = $1', [code]);
    const def = defRows.rows[0];
    if (!def) return fail('QUEST_NOT_FOUND', '任务不存在：' + code);
    const [statuses, seen] = await Promise.all([this.questStatuses(userId), this.seenSet(character.id)]);
    const nodes: StoryNode[] = [];
    this.pushQuestNodes(nodes, def, statuses, seen);
    return {
      success: true,
      message: '获取任务剧本成功',
      data: { quest: { code: def.code, name: def.name, status: statuses.get(def.code) ?? 'locked' }, nodes },
    };
  }

  async markSeen(userId: number, nodeKey: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error;
    const key = typeof nodeKey === 'string' ? nodeKey.trim() : '';
    if (!key || key.length > 120) return fail('INVALID_PARAM', 'nodeKey 需为 1~120 字符');
    await this.gameDb.query(
      'INSERT INTO game_story_seen (character_id, node_key, seen_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (character_id, node_key) DO NOTHING',
      [character.id, key],
    );
    return { success: true, message: '已标记已读', data: { nodeKey: key, seen: true } };
  }
}
