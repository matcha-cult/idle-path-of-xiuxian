/**
 * §23 A3：挂机「整轮」结算的**纯计算**（击杀按层分摊 + 多层结果聚合）。
 *
 * ⚠️ **临时方案（TEMPORARY-OFFLINE-IDLE）**：「按层均分击杀 + 逐层调用 settleKills」
 * 是**过渡实现**，只服务于「离线时间兑产出」这条临时链路。终态是**战斗逻辑服**在服务端
 * **实时**推进挂机战斗（组队开战后无法保证队员全程在线）。标记登记表与退出条件见
 * `ai-docs/frontend-solution-exploration/23-挂机开发交接.md` §0.1。
 *
 * 背景（`23-挂机开发交接.md` §3.5）：旧实现把挂机钉在 `min(progress.floor, maxFloor)`
 * —— 已突破秘境的 `floor` 恒为 `max_floor`（Boss 层）⇒ **挂机永远在打 Boss**。
 * A3 改为**循环整轮**：一轮 = 1..maxFloor 全部层，总击杀按层均分，每层带自己的单位 /
 * 层灵韵 / 掉落档各走一次既有的 `combat.settleKills`，最后把结果聚合成一个结算体。
 *
 * 本文件只做纯计算：不碰 DB、不 import Nest、不读配置（便于边界单测）。
 */
import type { SettlementData } from '../../combat/combat.api.js';
import type { ItemView } from '../../item/item.api.js';

/** `settleKills` 单次调用回填的 `items` 预览上限（与 `unit.service.ts` 的 `< 50` 同口径）。 */
export const ITEMS_PREVIEW_CAP = 50;

/** 多层聚合后的结算体：与单次 `SettlementData` 同形，只去掉单层语义的 `unit`。 */
export type AggregatedSettlement = Omit<SettlementData, 'unit'>;

/**
 * 把总击杀按「循环整轮」摊到各层。
 *
 * 语义 = 一轮一轮往下打：`kills = q × n + r` ⇒ 每层 `q` 杀，**前 `r` 层各多 1 杀**
 * （即打完了 `q` 个整轮，外加下一轮的前 `r` 层）。落在层边界上的分法才叫"循环整轮"：
 * - `kills = 1`、`n = 3` → `[1, 0, 0]`（只够打第 1 层）；
 * - `kills = 2`、`n = 3` → `[1, 1, 0]`；
 * - `kills = 7`、`n = 3` → `[3, 2, 2]`（两个整轮 + 下一轮第 1 层）。
 *
 * `kills > 0` 且 `floorCount > 0` 时返回数组长度恒为 `n`；**调用方必须跳过 0 杀的层**
 * —— `settleKills` 的层灵韵是「每次调用加一次」，空调用会白送该层灵韵。
 *
 * 边界：非有限数 / `kills ≤ 0` / `floorCount ≤ 0` → `[]`（调用方据此不结算任何层）。
 */
export function splitKillsByFloor(kills: number, floorCount: number): number[] {
  if (!Number.isFinite(kills) || !Number.isFinite(floorCount)) return [];
  const total = Math.floor(kills);
  const n = Math.floor(floorCount);
  if (total <= 0 || n <= 0) return [];
  const per = Math.floor(total / n);
  const rest = total - per * n;
  return Array.from({ length: n }, (_, index) => per + (index < rest ? 1 : 0));
}

/** 按 key 累加（`currencies` / `essences` 是 code → 数量）。非有限值按 0 计，防 NaN 污染整轮。 */
function addByKey(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) {
    if (!Number.isFinite(value)) continue;
    target[key] = (target[key] ?? 0) + value;
  }
}

/**
 * 把逐层 `settleKills` 的结果聚合成一个结算体。
 *
 * 口径（§3.5 第 4 条，全部由单测钉住）：
 * - 数值项（`lingyunGained` / `kept` / `discarded` / `blockedByTier` / `itemsProduced`）**累加**；
 * - `salvaged` / `sold` 是对象，**逐字段**累加；
 * - `currencies` / `essences` **按 key** 累加；
 * - `items` 数组合并后**整体**截断到 {@link ITEMS_PREVIEW_CAP}（它只是"打到了什么"的预览，
 *   真实件数以 `kept` 为准 —— 与单次调用"`kept` 可超过 `items.length`"的既有语义一致）；
 * - `lingyunTotal` 取**最后一次**调用的权威余额（players.lingyun 的落库回读值）；
 * - `kills` 用**本次整轮的总击杀**（= 各层分摊之和），不是某一次调用的 `kills`。
 *
 * 边界：`parts` 为空 → 除 `kills` 外全零、`lingyunTotal` 为 0。
 */
export function aggregateSettlement(
  parts: readonly SettlementData[],
  totalKills: number,
): AggregatedSettlement {
  const aggregated: AggregatedSettlement = {
    kills: Number.isFinite(totalKills) && totalKills > 0 ? Math.floor(totalKills) : 0,
    lingyunGained: 0,
    lingyunTotal: 0,
    items: [],
    kept: 0,
    salvaged: { count: 0, lingyun: 0 },
    sold: { count: 0, spiritStones: 0 },
    discarded: 0,
    blockedByTier: 0,
    currencies: {},
    essences: {},
    itemsProduced: 0,
  };

  for (const part of parts) {
    aggregated.lingyunGained += part.lingyunGained;
    aggregated.lingyunTotal = part.lingyunTotal;
    aggregated.kept += part.kept;
    aggregated.salvaged.count += part.salvaged.count;
    aggregated.salvaged.lingyun += part.salvaged.lingyun;
    aggregated.sold.count += part.sold.count;
    aggregated.sold.spiritStones += part.sold.spiritStones;
    aggregated.discarded += part.discarded;
    aggregated.blockedByTier += part.blockedByTier;
    aggregated.itemsProduced += part.itemsProduced;
    for (const item of part.items as ItemView[]) {
      if (aggregated.items.length < ITEMS_PREVIEW_CAP) aggregated.items.push(item);
    }
    addByKey(aggregated.currencies, part.currencies);
    addByKey(aggregated.essences, part.essences);
  }

  return aggregated;
}
