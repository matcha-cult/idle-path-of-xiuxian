/**
 * 业务失败结果共享内核
 *
 * 各逻辑服原先各自定义了一份完全相同的 FailResult/fail，并出现
 * zone.types → unit.types、quest.types → unit.types 这类跨服类型边。
 * 统一上提到共享内核后：
 * - 各域 types 只做再导出，保持既有引用不变；
 * - 跨服类型依赖消失（只剩对 infra 的依赖）。
 */

/** 业务错误结果（通过 success:false + data.code 表达） */
export interface FailResult {
  success: false;
  message: string;
  data: { code: string };
}

export function fail(code: string, message: string): FailResult {
  return { success: false, message, data: { code } };
}
