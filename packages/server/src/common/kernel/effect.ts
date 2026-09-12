/**
 * 效果词表共享内核
 *
 * 归属：共享内核（低于所有逻辑服），供 item / skill 等共同只读引用，
 * 避免出现 skill → item 这类跨服值依赖（会破坏 §3 的 DAG）。
 */

/** 效果键 → 中文展示名 */
export const EFFECT_LABELS: Record<string, string> = {
  atk: '攻击',
  def: '防御',
  hp: '生命',
  hp_pct: '生命加成',
  skill_damage: '技能伤害',
  spirit_power: '灵力',
  atk_speed: '攻速',
  hp_regen: '生命回复',
  lingyun_gain: '灵韵获取',
  spirit_power_pct: '灵力加成',
  move_speed: '移速',
  focus: '神识',
  crit: '暴击',
  all_stats: '全属性',
  atk_pct: '攻击加成',
  atk_speed_pct: '攻速加成',
  all_stats_pct: '全属性加成',
  vs_demon_pct: '对魔修增伤',
};

/** 百分比类效果键 */
export const PERCENT_KEYS = new Set([
  'crit',
  'spirit_power_pct',
  'hp_pct',
  'atk_pct',
  'atk_speed_pct',
  'all_stats_pct',
  'vs_demon_pct',
]);
