/**
 * 境界公共词汇共享内核（v2 §2.1 十四境；玩家封顶 14）
 *
 * 归属：共享内核（低于所有逻辑服），供 realm 自身与 combat 等只读引用，
 * 避免出现 combat → realm 这类跨服值依赖（会破坏 §3 的 DAG）。
 */
export const REALMS = [
  '铜皮', '草根', '柳筋', '骨气', '铸炉', '洞府', '观海',
  '龙门', '金丹', '元婴', '玉璞', '仙人', '飞升', '合道',
] as const;

export const MAX_REALM = 14;

export function realmName(realm: number): string {
  return REALMS[realm - 1] ?? '未知';
}
