/**
 * 境界常量（v2 §2.1 十四境；玩家封顶 14）
 *
 * REALMS / MAX_REALM / realmName 已上提到共享内核（common/kernel/realm.ts），
 * 此处再导出保持既有引用；境界服自身与 combat 均从内核读取。
 */
export { REALMS, MAX_REALM, realmName } from '../../../../common/kernel/realm.js';

export interface FailResult {
  success: false;
  message: string;
  data: { code: string };
}

export function fail(code: string, message: string): FailResult {
  return { success: false, message, data: { code } };
}
