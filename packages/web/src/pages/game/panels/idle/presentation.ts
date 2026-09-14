/**
 * 挂机面板的**展示判定**（纯函数，单独成文件便于单测与复用）。
 *
 * ⚠️ **临时方案（TEMPORARY-OFFLINE-IDLE）**：本文件把「离线时间兑产出」的结算体
 * （`zone` + `floors` 逐层战果）翻译成玩家文案 —— 这套形状随临时链路一起作废。
 * 终态是**战斗逻辑服**在服务端实时推进挂机战斗，展示会改成实时战报。
 * 标记登记表见 `ai-docs/frontend-solution-exploration/23-挂机开发交接.md` §0.1。
 *
 * 这里只做「把服务端给的值翻译成玩家看得懂的话」，**不含任何业务规则**：
 * 效率 / 封顶 / 额度 / 逐层战果全部来自服务端，前端不本地重算（R2 §4.2）。
 *
 * §23 A3：`idle.settle` 的响应从「单一单位」改成 `zone` + `floors`（整轮逐层），
 * 因此结算标题与明细都必须按层呈现，**判别式是 `kills === 0`**（不再是 `unit === null`）。
 */
import type {
  CurrencyView,
  EssenceView,
  IdleFloorView,
  IdleSettleResultData,
  IdleStatusData,
} from '@idle-path/ionet-transport';
import { formatDuration, type KeyValueEntry } from '@idle-path/ui-kit';
import { formatCompactNumber } from '../../../../domain/format.js';

/** 挂机规则（取自服务端 `config`，只翻译成玩家语言，不新增规则）。 */
export function idleRuleEntries(config: IdleStatusData['config']): KeyValueEntry[] {
  const perRoundHours = config.roundsPerHour > 0 ? 1 / config.roundsPerHour : Number.NaN;
  return [
    {
      key: 'pace',
      label: '结算节奏',
      value: config.roundsPerHour > 0 ? `每轮 ${formatDuration(perRoundHours)}` : '—',
    },
    { key: 'efficiency', label: '挂机效率', value: `${formatCompactNumber(config.efficiencyPct)}%` },
    { key: 'cap', label: '离线封顶', value: formatDuration(config.maxOfflineHours) },
  ];
}

/**
 * 逐层战果（第 N 层 · 单位 ×击杀）。
 *
 * 非有限 / 非正的层号与击杀按占位符处理；`floors` 为空（显式 `unitCode` 的调试结算）
 * 时返回空数组 —— 调用方据此不渲染该段。
 */
export function idleFloorEntries(floors: readonly IdleFloorView[]): KeyValueEntry[] {
  return floors.map((entry, index) => {
    const floor = Number.isFinite(entry.floor) ? entry.floor : 0;
    const kills = Number.isFinite(entry.kills) ? Math.max(0, entry.kills) : 0;
    const unitName = entry.unitName === '' ? '未知单位' : entry.unitName;
    return {
      key: `floor-${String(entry.floor)}-${String(index)}`,
      label: floor > 0 ? `第 ${formatCompactNumber(floor)} 层${entry.isBoss ? '（Boss）' : ''}` : '本层',
      value: `${unitName} ×${formatCompactNumber(kills)}`,
    };
  });
}

/** 结算明细（结算秘境 / 本轮层数 / 离线时长 / 有效时长 / 今日产出）。 */
export function idleSettleEntries(last: IdleSettleResultData): KeyValueEntry[] {
  const zoneName = last.zone === null ? null : last.zone.name;
  const entries: KeyValueEntry[] = [
    { key: 'zone', label: '结算秘境', value: zoneName ?? '—' },
    { key: 'offline', label: '离线时长', value: formatDuration(last.offlineHours) },
    { key: 'effective', label: '有效时长', value: formatDuration(last.effectiveHours) },
    {
      key: 'daily',
      label: '今日物品产出',
      value: `${formatCompactNumber(last.dailyItemsProduced)} / ${formatCompactNumber(last.dailyItemCap)}`,
    },
  ];
  if (last.floors.length > 0) {
    entries.splice(1, 0, { key: 'round', label: '本轮层数', value: `${last.floors.length} 层` });
  }
  return entries;
}

/** 结算标题：空分支（`kills === 0`）明确说明「没有可结算收益」，不当作错误。 */
export function idleSettleSubtitle(last: IdleSettleResultData): string {
  if (last.kills <= 0) return `离线 ${formatDuration(last.offlineHours)} · 暂无可结算收益`;
  const kills = `击杀 ${formatCompactNumber(last.kills)}`;
  if (last.zone === null || last.floors.length === 0) return kills;
  return `${last.zone.name} · ${last.floors.length} 层 · ${kills}`;
}

/** 通货/精华 code → 中文名；查不到时给占位文案，**绝不把协议 code 打到屏幕上**。 */
export function resourceNameOf(currencies: readonly CurrencyView[], essences: readonly EssenceView[]) {
  const names = new Map<string, string>();
  for (const entry of [...currencies, ...essences]) names.set(entry.code, entry.name);
  return (code: string): string => names.get(code) ?? '未知掉落';
}
