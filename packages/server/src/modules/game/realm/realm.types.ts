/**
 * 境界常量（v2 §2.1 十四境；玩家封顶 14）
 */
export const REALMS = [
  '铜皮', '草根', '柳筋', '骨气', '铸炉', '洞府', '观海',
  '龙门', '金丹', '元婴', '玉璞', '仙人', '飞升', '合道',
] as const;

export const MAX_REALM = 14;

export function realmName(realm: number): string {
  return REALMS[realm - 1] ?? '未知';
}

export interface FailResult {
  success: false;
  message: string;
  data: { code: string };
}

export function fail(code: string, message: string): FailResult {
  return { success: false, message, data: { code } };
}
