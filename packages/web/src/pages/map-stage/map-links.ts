/**
 * 连接线（图的边）—— **只写规则，不写边**。
 *
 * ## 为什么是规则而不是边表
 *
 * 旧种子数据（`packages/server/prisma/seeds/game/map-edges.json`）是 32 条边：
 *
 * ```
 * 门 ↔ 峰 : 8   每座门连角度最近的 2 颗峰
 * 峰 ↔ 峰 : 8   八峰首尾成环
 * 院 ↔ 峰 : 8   每颗峰连角度最近的那座院
 * 院 ↔ 院 : 4   四院成方环
 * 院 ↔ 主峰 : 4  辐条
 * ```
 *
 * 这三条规则（`ring` / `nearest` / `hub`）能**精确重放**它。差别在于：半径一调、
 * 预留位一启用、以后再加点，边会**自动跟着变**；而 32 行的边表每次都得手工同步 ——
 * 那正是"数据改了、别处悄悄过期"的温床（本项目已经栽过一次：读数里写死的格点例子）。
 *
 * ## 口径
 * - 只连**会被渲染**的点（`hidden` 的预留位不参与，否则会出现"连着看不见的点"的线）；
 * - **无向去重**：同一条边被两条规则命中只画一次（首尾成环、规则交叉都在这里挡掉）；
 * - **不自环**：起点终点同 key 不画；
 * - `nearest` 的角度并列（例如某颗峰正好落在两座院中间）⇒ **都连**，保证结果确定、可复现。
 */
import type { WorldPoint } from '@idle-path/ui-kit';
import { MAP_LINK_RULES } from './map-catalog.js';
import type { MapLinkRule, ResolvedMapLink, ResolvedMapPoint } from './map-types.js';

/** 两个角度的最小夹角（0..180 度），用于「就近相连」。 */
export function angularGap(a: number, b: number): number {
  const gap = (((a - b) % 360) + 360) % 360;
  return Math.min(gap, 360 - gap);
}

/** 某个环上**会被渲染**的点，按环上角度排序（0° 起、逆时针）。 */
function ringPoints(points: readonly ResolvedMapPoint[], ring: string): ResolvedMapPoint[] {
  return points
    .filter((point) => point.ring === ring && point.hidden !== true)
    .sort((a, b) => (a.angleDeg ?? 0) - (b.angleDeg ?? 0));
}

/** 把规则解析成具体的边（纯函数：同样的输入永远同样的输出，顺序也稳定）。 */
export function resolveMapLinks(
  points: readonly ResolvedMapPoint[],
  rules: readonly MapLinkRule[] = MAP_LINK_RULES,
): ResolvedMapLink[] {
  const seen = new Set<string>();
  const links: ResolvedMapLink[] = [];

  const add = (a: ResolvedMapPoint, b: ResolvedMapPoint, rule: string): void => {
    if (a.key === b.key) return; // 自环不画
    const pair = [a.key, b.key].sort().join('|');
    if (seen.has(pair)) return; // 无向去重
    seen.add(pair);
    links.push({ fromKey: a.key, toKey: b.key, rule, from: a.world, to: b.world });
  };

  for (const rule of rules) {
    if (rule.kind === 'ring') {
      const ring = ringPoints(points, rule.ring);
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (a !== undefined && b !== undefined) add(a, b, rule.label);
      }
      continue;
    }

    if (rule.kind === 'nearest') {
      const targets = ringPoints(points, rule.to);
      for (const from of ringPoints(points, rule.from)) {
        if (from.angleDeg === undefined) continue; // 没有角度（如中心点）无法谈"就近"
        let best = Number.POSITIVE_INFINITY;
        let winners: ResolvedMapPoint[] = [];
        for (const target of targets) {
          if (target.angleDeg === undefined) continue;
          const gap = angularGap(from.angleDeg, target.angleDeg);
          if (gap < best - 1e-9) {
            best = gap;
            winners = [target];
          } else if (Math.abs(gap - best) <= 1e-9) {
            winners.push(target);
          }
        }
        for (const winner of winners) add(from, winner, rule.label);
      }
      continue;
    }

    for (const hub of ringPoints(points, rule.hub)) {
      for (const target of ringPoints(points, rule.to)) add(hub, target, rule.label);
    }
  }

  return links;
}

/** 供 `<CanvasGrid links>` 用：只留两端世界坐标（绘制层不认识业务）。 */
export function toGridLinks(links: readonly ResolvedMapLink[]): { from: WorldPoint; to: WorldPoint }[] {
  return links.map((link) => ({ from: link.from, to: link.to }));
}

/** 按规则分组统计（读数里显示成「32 条（主峰辐条 4 · 八峰环 8 …）」）。 */
export function linkBreakdown(links: readonly ResolvedMapLink[]): { rule: string; count: number }[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const link of links) {
    if (!counts.has(link.rule)) order.push(link.rule);
    counts.set(link.rule, (counts.get(link.rule) ?? 0) + 1);
  }
  return order.map((rule) => ({ rule, count: counts.get(rule) ?? 0 }));
}
