/**
 * 功法服务：图鉴 / 修习 / 面板 / 参悟 / 开发注入（灵韵、玉简）
 *
 * 跨库一致性：玉简/灵韵在 characters（用户库），功法数据在 game 库——
 * 双库无法同事务（O1），采用「原子扣减 + 失败补偿」的迷你 SAGA 模式。
 */
import { Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../common/config/app-config.js';
import { RateLimiterService } from '../../../common/services/rate-limiter.service.js';
import { CharacterService } from '../../character/character.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { GameDatabaseService } from '../game-database.service.js';
import { EFFECT_LABELS, PERCENT_KEYS } from '../item/item.types.js';
import {
  PANEL_LIMITS,
  type FailResult,
  type LearnedRow,
  type PanelSlots,
  type SkillRow,
  emptyPanel,
  fail,
} from './skill.types.js';

@Injectable()
export class SkillService {
  constructor(
    private readonly gameDb: GameDatabaseService,
    private readonly userDb: DatabaseService,
    private readonly characterService: CharacterService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  // ===== 开发注入门禁（共享限流器：generate/lingyun-grant/jade-grant 共用额度） =====

  private productionGuard() {
    if ((process.env.NODE_ENV ?? 'development') === 'production') {
      return fail('FORBIDDEN', '开发接口在生产环境不可用');
    }
    return null;
  }

  private async resolveCharacter(userId: number) {
    const character = await this.characterService.findByUserId(userId);
    if (!character) {
      return { error: fail('CHARACTER_NOT_FOUND', '尚未创建角色') };
    }
    return { character };
  }

  private parseJson<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }

  /** 效果文本（L 级效果 = base × (1 + growthRate × (L-1))） */
  private renderEffects(level: number, effectsRaw: string, growthRate: number): string[] {
    const effects = this.parseJson<Record<string, number>>(effectsRaw, {});
    const mul = 1 + growthRate * (level - 1);
    return Object.entries(effects).map(([key, base]) => {
      const v = base * mul;
      const pct = PERCENT_KEYS.has(key);
      const shown = pct ? `${Number(v.toFixed(1))}%` : String(Math.round(v));
      return `${EFFECT_LABELS[key] ?? key} ${shown}（${level}级 效果）`;
    });
  }

  private async findSkillsByCodes(codes: string[]): Promise<Map<string, SkillRow>> {
    if (codes.length === 0) return new Map();
    const rows = await this.gameDb.query<SkillRow>(
      'SELECT * FROM game_skills WHERE code = ANY($1::text[])',
      [codes],
    );
    return new Map(rows.rows.map((r) => [r.code, r]));
  }

  // ===== 图鉴 ===== 
  
  async catalog(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    const [skillRows, learnedRows] = await Promise.all([
      this.gameDb.query<SkillRow>('SELECT * FROM game_skills ORDER BY id'),
      this.gameDb.query<LearnedRow>(
        'SELECT * FROM game_learned_skills WHERE character_id = $1',
        [character.id],
      ),
    ]);
    const learned = new Map(learnedRows.rows.map((r) => [r.skill_id, r.level]));
    const skills = skillRows.rows.map((s) => {
      const isLearned = learned.has(s.id);
      const level = learned.get(s.id) ?? 1;
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        skillType: s.skill_type,
        daoji: s.daoji,
        school: s.school,
        spiritCost: Number(s.spirit_cost),
        description: s.description ?? '',
        learned: isLearned,
        level: isLearned ? level : null,
        effectsTexts: this.renderEffects(level, s.effects, Number(s.growth_rate)),
      };
    });
    return { success: true, message: '获取功法图鉴成功', data: { skills } };
  }

  // ===== 修习（消耗 1 枚玉简；SAGA：扣减-插入-冲突补偿） =====
  async learn(userId: number, skillId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    const skillRows = await this.gameDb.query<{ id: number }>(
      'SELECT id FROM game_skills WHERE id = $1',
      [skillId],
    );
    if (!skillRows.rows[0]) return fail('SKILL_NOT_FOUND', '功法不存在');

    const learnedRows = await this.gameDb.query<{ id: number }>(
      'SELECT id FROM game_learned_skills WHERE character_id = $1 AND skill_id = $2',
      [character.id, skillId],
    );
    if (learnedRows.rows[0]) return fail('ALREADY_LEARNED', '该功法已修习，无需重复');

    // 原子扣玉简（用户库）
    const upd = await this.userDb.query<{ jade_slips: string }>(
      `UPDATE characters SET jade_slips = jade_slips - 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND jade_slips >= 1 RETURNING jade_slips`,
      [character.id],
    );
    if (upd.rows.length === 0) return fail('JADE_NOT_ENOUGH', '未开光玉简不足（需要 1 枚）');

    let ins: { rows: { id: number }[] };
    try {
      ins = await this.gameDb.query<{ id: number }>(
        `INSERT INTO game_learned_skills (character_id, skill_id, level) VALUES ($1, $2, 1)
         ON CONFLICT (character_id, skill_id) DO NOTHING RETURNING id`,
        [character.id, skillId],
      );
    } catch (err) {
      // 插入异常 → 退还玉简（SAGA 补偿）
      await this.userDb.query(
        'UPDATE characters SET jade_slips = jade_slips + 1 WHERE id = $1',
        [character.id],
      );
      throw err;
    }
    if (ins.rows.length === 0) {
      // 并发竞态：期间已被修习 → 补偿玉简
      await this.userDb.query(
        'UPDATE characters SET jade_slips = jade_slips + 1 WHERE id = $1',
        [character.id],
      );
      return fail('ALREADY_LEARNED', '该功法已修习（并发）');
    }
    return {
      success: true,
      message: '修习成功，功法已收入功法册',
      data: { skillId, jadeSlips: Number(upd.rows[0].jade_slips) },
    };
  }

  // ===== 面板读取 ===== 
  
  async getPanel(userId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    const row = await this.gameDb.query<{ slots: string }>(
      'SELECT slots FROM game_skill_panels WHERE character_id = $1',
      [character.id],
    );
    const slots = row.rows[0] ? this.parseJson<PanelSlots>(row.rows[0].slots, emptyPanel()) : emptyPanel();
    return { success: true, message: '获取功法面板成功', data: await this.panelView(slots) };
  }

  private async panelView(slots: PanelSlots): Promise<Record<string, unknown>> {
    const codes = new Set<string>();
    if (slots.xinfa.main) codes.add(slots.xinfa.main);
    for (const c of slots.xinfa.aux) codes.add(c);
    for (const c of slots.shufa) codes.add(c);
    const skillMap = await this.findSkillsByCodes([...codes]);
    const info = (code: string) => {
      const s = skillMap.get(code);
      return s ? { code: s.code, name: s.name, daoji: s.daoji, spiritCost: Number(s.spirit_cost) } : null;
    };
    let spiritUsed = 0;
    for (const c of slots.xinfa.aux) {
      const s = skillMap.get(c);
      if (s) spiritUsed += Number(s.spirit_cost);
    }
    const mainSkill = slots.xinfa.main ? skillMap.get(slots.xinfa.main) : null;
    const mainDaoji = mainSkill ? mainSkill.daoji : null;
    const synergy = slots.shufa.map((code) => {
      const s = skillMap.get(code);
      const matched = Boolean(mainDaoji && s && s.daoji === mainDaoji);
      return {
        code,
        matched,
        text: matched ? `道基协同 +${APP_CONFIG.synergyBonusPct}%（占位）` : '',
      };
    });
    return {
      panel: {
        xinfa: { main: slots.xinfa.main, mainInfo: slots.xinfa.main ? info(slots.xinfa.main) : null, aux: slots.xinfa.aux.map((c) => ({ code: c, info: info(c) })) },
        shufa: slots.shufa.map((c) => ({ code: c, info: info(c), synergy: synergy.find((s) => s.code === c) ?? null })),
        spiritUsed,
        spiritBudget: APP_CONFIG.spiritBudget,
        mainDaoji,
      },
    };
  }

  // ===== 面板写入（整组替换；免费换装） =====
  async putPanel(
    userId: number,
    payload: unknown,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;

    // 结构规范化 + 校验
    const body = payload as { xinfa?: { main?: unknown; aux?: unknown }; shufa?: unknown } | null | undefined;
    // 数组 typeof 亦为 object，需显式排除（否则 [] 会被当作空面板成功写入）
    if (body == null || typeof body !== 'object' || Array.isArray(body)) return fail('SLOTS_INVALID', '面板结构非法');
    if (body.xinfa != null && (typeof body.xinfa !== 'object' || body.xinfa == null)) return fail('SLOTS_INVALID', '面板结构非法');

    const main = typeof body.xinfa?.main === 'string' && body.xinfa.main.trim() ? body.xinfa.main.trim() : null;
    const auxRaw = Array.isArray(body.xinfa?.aux) ? body.xinfa.aux : [];
    const shufaRaw = Array.isArray(body.shufa) ? body.shufa : [];
    const auxList = auxRaw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
    const shufaList = shufaRaw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());

    // 重复检测必须先于去重（契约要求显式拒绝 DUPLICATE_SLOT）
    if (new Set(auxList).size !== auxList.length) return fail('DUPLICATE_SLOT', '辅心法槽位 code 重复');
    if (new Set(shufaList).size !== shufaList.length) return fail('DUPLICATE_SLOT', '术法槽位 code 重复');
    const aux = auxList;
    const shufa = shufaList;

    if (aux.length > PANEL_LIMITS.aux) return fail('SLOT_COUNT_EXCEEDED', `辅心法最多 ${PANEL_LIMITS.aux} 个`);
    if (shufa.length > PANEL_LIMITS.shufa) return fail('SLOT_COUNT_EXCEEDED', `术法最多 ${PANEL_LIMITS.shufa} 个`);
    if (main && aux.includes(main)) return fail('DUPLICATE_SLOT', '主心法与辅心法槽位重复');

    const allCodes = [main, ...aux, ...shufa].filter((c): c is string => c != null);
    const skillMap = await this.findSkillsByCodes(allCodes);
    for (const code of allCodes) {
      if (!skillMap.has(code)) return fail('SKILL_NOT_FOUND', `功法不存在：${code}`);
    }
    if (main && skillMap.get(main)?.skill_type !== 'xinfa') return fail('SLOTS_INVALID', '主心法槽位只能用心法');
    for (const code of aux) {
      if (skillMap.get(code)?.skill_type !== 'xinfa') return fail('SLOTS_INVALID', `辅心法槽位只能用心法：${code}`);
    }
    for (const code of shufa) {
      if (skillMap.get(code)?.skill_type !== 'shufa') return fail('SLOTS_INVALID', `术法槽位只能用术法：${code}`);
    }

    // 已修习校验
    const skillIds = allCodes.map((c) => skillMap.get(c)?.id).filter((v): v is number => v != null);
    const learnedRows = await this.gameDb.query<{ skill_id: number }>(
      'SELECT skill_id FROM game_learned_skills WHERE character_id = $1 AND skill_id = ANY($2::int[])',
      [character.id, skillIds],
    );
    const learnedSet = new Set(learnedRows.rows.map((r) => Number(r.skill_id)));
    for (const code of allCodes) {
      const skill = skillMap.get(code);
      if (skill && !learnedSet.has(skill.id)) return fail('NOT_LEARNED', `未修习功法：${code}`);
    }

    // 神识预算（3 辅共享）
    let spiritUsed = 0;
    for (const code of aux) {
      spiritUsed += Number(skillMap.get(code)?.spirit_cost ?? 0);
    }
    if (spiritUsed > APP_CONFIG.spiritBudget) {
      return fail(
        'SPIRIT_BUDGET_EXCEEDED',
        `辅心法神识占用 ${spiritUsed} 超出预算 ${APP_CONFIG.spiritBudget}`,
      );
    }

    const slots: PanelSlots = { xinfa: { main, aux }, shufa };
    await this.gameDb.query(
      `INSERT INTO game_skill_panels (character_id, slots) VALUES ($1, $2)
       ON CONFLICT (character_id) DO UPDATE SET slots = EXCLUDED.slots, updated_at = CURRENT_TIMESTAMP`,
      [character.id, JSON.stringify(slots)],
    );

    return { success: true, message: '功法面板已更新', data: await this.panelView(slots) };
  }

  // ===== 参悟（SAGA：原子扣灵韵 → 升级；失败补偿） =====
  async enlighten(userId: number, skillId: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    const skillRows = await this.gameDb.query<{ id: number; name: string }>(
      'SELECT id, name FROM game_skills WHERE id = $1',
      [skillId],
    );
    if (!skillRows.rows[0]) return fail('SKILL_NOT_FOUND', '功法不存在');

    const learnedRows = await this.gameDb.query<LearnedRow>(
      'SELECT * FROM game_learned_skills WHERE character_id = $1 AND skill_id = $2',
      [character.id, skillId],
    );
    const learned = learnedRows.rows[0];
    if (!learned) return fail('NOT_LEARNED', '尚未修习该功法');
    if (Number(learned.level) >= APP_CONFIG.maxSkillLevel) {
      return fail('MAX_LEVEL_REACHED', `已达参悟上限 ${APP_CONFIG.maxSkillLevel} 级`);
    }
    const cost = APP_CONFIG.enlightenBaseCost * Number(learned.level);

    // 原子扣灵韵（用户库）
    const upd = await this.userDb.query<{ lingyun: string }>(
      `UPDATE characters SET lingyun = lingyun - $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND lingyun >= $1 RETURNING lingyun`,
      [cost, character.id],
    );
    if (upd.rows.length === 0) {
      return fail('LINGYUN_NOT_ENOUGH', `灵韵不足：需要 ${cost}，当前 ${character.lingyun}`);
    }

    try {
      const next = await this.gameDb.query<{ level: number }>(
        `UPDATE game_learned_skills SET level = level + 1 WHERE id = $1 RETURNING level`,
        [learned.id],
      );
      if (!next.rows[0]) throw new Error('learned row missing');
      return {
        success: true,
        message: `参悟成功：${skillRows.rows[0].name} 升至 ${next.rows[0].level} 级`,
        data: { skillId, level: Number(next.rows[0].level), lingyun: Number(upd.rows[0].lingyun) },
      };
    } catch (err) {
      // 升级失败 → 补偿灵韵
      await this.userDb.query(
        'UPDATE characters SET lingyun = lingyun + $1 WHERE id = $2',
        [cost, character.id],
      );
      throw err;
    }
  }

  // ===== 开发注入：灵韵（dev 门禁 + 限流） =====
  async grantLingyun(userId: number, amount: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const guard = this.productionGuard();
    if (guard) return guard as FailResult;
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    if (!this.rateLimiter.allow(userId, APP_CONFIG.devToolRateLimitPerMinute)) {
      return fail('RATE_LIMITED', `开发注入接口每分钟最多调用 ${APP_CONFIG.devToolRateLimitPerMinute} 次`);
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) {
      return fail('INVALID_PARAM', 'amount 需为 1~1000000 的整数');
    }
    const upd = await this.userDb.query<{ lingyun: string }>(
      `UPDATE characters SET lingyun = lingyun + $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING lingyun`,
      [amount, character.id],
    );
    return { success: true, message: `注入灵韵 ${amount}`, data: { lingyun: Number(upd.rows[0].lingyun) } };
  }

  // ===== 开发发放：未开光玉简（dev 门禁 + 限流） =====
  async grantJade(userId: number, count: number): Promise<{ success: boolean; message: string; data?: unknown }> {
    const guard = this.productionGuard();
    if (guard) return guard as FailResult;
    const { character, error } = await this.resolveCharacter(userId);
    if (error) return error as FailResult;
    if (!this.rateLimiter.allow(userId, APP_CONFIG.devToolRateLimitPerMinute)) {
      return fail('RATE_LIMITED', `开发发放接口每分钟最多调用 ${APP_CONFIG.devToolRateLimitPerMinute} 次`);
    }
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return fail('INVALID_PARAM', 'count 需为 1~100 的整数');
    }
    const upd = await this.userDb.query<{ jade_slips: string }>(
      `UPDATE characters SET jade_slips = jade_slips + $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING jade_slips`,
      [count, character.id],
    );
    return { success: true, message: `发放未开光玉简 ${count}`, data: { jadeSlips: Number(upd.rows[0].jade_slips) } };
  }
}
