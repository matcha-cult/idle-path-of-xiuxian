/**
 * `map-links` 单测 —— 连接线是"地图的拓扑"，错了会以"少一条边/连错一个点"的方式静默存在。
 *
 * 这里守住四件事：
 * 1. **精确重放旧种子的 32 条边**（`prisma/seeds/game/map-edges.json` 的拓扑）；
 * 2. **只连会被渲染的点**：隐藏的预留位不参与（否则会出现"连着看不见的点"的线）；
 * 3. **无向去重 + 不自环**：同一条边被两条规则命中只画一次、首尾成环不产生重复；
 * 4. **确定性**：同样的输入永远同样的输出与顺序（读数、测试、以后的后端都依赖它）。
 */
import { describe, expect, it } from 'vitest';
import { MAP_LINK_RULES, MAP_POINTS, resolveMapLinks, resolveMapPoints } from './map-points.js';
import type { MapLinkRule } from './map-points.js';
import { angularGap, linkBreakdown, toGridLinks } from './map-links.js';

const POINTS = resolveMapPoints();
const LINKS = resolveMapLinks(POINTS);

/** 是否存在 a—b 这条边（无向，顺序无关）。 */
const hasLink = (links: typeof LINKS, a: string, b: string): boolean =>
  links.some(
    (link) =>
      (link.fromKey === a && link.toKey === b) || (link.fromKey === b && link.toKey === a),
  );

describe('角度工具', () => {
  it('最小夹角恒在 0..180（跨 0° 也对）', () => {
    expect(angularGap(0, 0)).toBe(0);
    expect(angularGap(0, 90)).toBe(90);
    expect(angularGap(350, 10)).toBe(20);
    expect(angularGap(10, 350)).toBe(20);
    expect(angularGap(0, 180)).toBe(180);
    expect(angularGap(0, 270)).toBe(90);
  });
});

describe('⭐ 重放旧种子的 32 条边', () => {
  it('总数 32（门↔峰 8 · 峰↔峰 8 · 院↔峰 8 · 院↔院 4 · 主峰↔院 4）', () => {
    expect(LINKS).toHaveLength(32);
  });

  it('按规则分组的条数与旧种子逐项一致', () => {
    expect(linkBreakdown(LINKS)).toEqual([
      { rule: '主峰辐条', count: 4 },
      { rule: '四院方环', count: 4 },
      { rule: '峰-院', count: 8 },
      { rule: '八峰环', count: 8 },
      { rule: '峰-门', count: 8 },
    ]);
  });

  it('主峰辐条：主峰连到**每一座**院（不是只连最近那座）', () => {
    for (const key of ['court_1', 'court_2', 'court_3', 'court_4']) {
      expect(hasLink(LINKS, 'summit', key)).toBe(true);
    }
  });

  it('四院方环：相邻成环（东—北—西—南—东）', () => {
    expect(hasLink(LINKS, 'court_1', 'court_2')).toBe(true); // 东—北
    expect(hasLink(LINKS, 'court_2', 'court_3')).toBe(true); // 北—西
    expect(hasLink(LINKS, 'court_3', 'court_4')).toBe(true); // 西—南
    expect(hasLink(LINKS, 'court_4', 'court_1')).toBe(true); // 南—东（首尾闭合）
    // 对角不相连（那是方环，不是叉）
    expect(hasLink(LINKS, 'court_1', 'court_3')).toBe(false);
  });

  it('八峰环：每颗峰连相邻两颗（含首尾闭合）', () => {
    for (let i = 1; i <= 8; i += 1) {
      const next = (i % 8) + 1;
      expect(hasLink(LINKS, `peak_${i}`, `peak_${next}`)).toBe(true);
    }
  });

  it('⭐ 峰-院 / 峰-门都是"就近"：每颗峰连**角度最近**的那一个', () => {
    // 八峰·一 在 22.5°，最近的院是四院·东（0°）、最近的门是宗门·东门（0°）
    expect(hasLink(LINKS, 'peak_1', 'court_1')).toBe(true);
    expect(hasLink(LINKS, 'peak_1', 'gate_1')).toBe(true);
    // 八峰·八 在 337.5°，最近的门仍是东门（差 22.5°，比到北门的 112.5° 近）
    expect(hasLink(LINKS, 'peak_8', 'gate_1')).toBe(true);
    expect(hasLink(LINKS, 'peak_8', 'gate_2')).toBe(false);
    // 每座门恰好连 2 颗峰、每座院恰好连 2 颗峰（只看"就近"这一类；院身上还有辐条与方环）
    for (let i = 1; i <= 4; i += 1) {
      expect(LINKS.filter((l) => l.rule === '峰-门' && hasMember(l, `gate_${i}`)).length).toBe(2);
      expect(LINKS.filter((l) => l.rule === '峰-院' && hasMember(l, `court_${i}`)).length).toBe(2);
    }
  });

  it('每条边的两端都是**存在**的点（没有拼错的 key）', () => {
    const keys = new Set(MAP_POINTS.map((point) => point.key));
    for (const link of LINKS) {
      expect(keys.has(link.fromKey)).toBe(true);
      expect(keys.has(link.toKey)).toBe(true);
    }
  });
});

/** 这条边是否接在某个点上（两端任一）。 */
function hasMember(link: (typeof LINKS)[number], key: string): boolean {
  return link.fromKey === key || link.toKey === key;
}

describe('⭐ 只连"会被渲染"的点', () => {
  it('隐藏的预留位不参与任何一条边（否则会出现连着看不见的点的线）', () => {
    for (const link of LINKS) {
      expect(link.fromKey.startsWith('inner_')).toBe(false);
      expect(link.toKey.startsWith('inner_')).toBe(false);
    }
  });

  it('把预留位全部启用后，边会**自动变多**（规则跟着数据走，不用改代码）', () => {
    const enabled = POINTS.map((point) => ({ ...point, hidden: undefined }));
    const withReserved = resolveMapLinks(enabled);
    // 内环加上 4 个点 ⇒ 方环变成 8 边形（+4 条），且每颗峰就近的院可能变成对角线上的院
    expect(withReserved.length).toBeGreaterThan(LINKS.length);
    expect(withReserved.some((link) => link.fromKey.startsWith('inner_'))).toBe(true);
  });
});

describe('去重、自环与确定性', () => {
  it('没有重复边（无向）：同一对点只出现一次', () => {
    const pairs = LINKS.map((link) => [link.fromKey, link.toKey].sort().join('|'));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('没有自环（起点终点同 key）', () => {
    for (const link of LINKS) {
      expect(link.fromKey).not.toBe(link.toKey);
    }
  });

  it('⭐ 确定性：同样的输入给出完全相同的输出与顺序', () => {
    expect(resolveMapLinks(POINTS)).toEqual(LINKS);
  });

  it('空点位 ⇒ 没有边，且不抛错', () => {
    expect(resolveMapLinks([])).toEqual([]);
  });

  it('引用了不存在的环 ⇒ 该规则不产出边，不抛错（脏数据防御）', () => {
    const rules: readonly MapLinkRule[] = [{ kind: 'ring', ring: 'nope', label: '空环' }];
    expect(resolveMapLinks(POINTS, rules)).toEqual([]);
  });

  it('自定义规则只产出该规则的边（规则列表就是拓扑的唯一来源）', () => {
    const rules: readonly MapLinkRule[] = [{ kind: 'hub', hub: 'summit', to: 'gate', label: '主峰-门' }];
    const links = resolveMapLinks(POINTS, rules);
    expect(links).toHaveLength(4); // 主峰 1 个 × 门 4 座
    expect(linkBreakdown(links)).toEqual([{ rule: '主峰-门', count: 4 }]);
  });

  it('没有角度的点不参与 nearest（中心点无法谈"就近"，跳过而不是抛错）', () => {
    const rules: readonly MapLinkRule[] = [{ kind: 'nearest', from: 'summit', to: 'court', label: 'x' }];
    expect(resolveMapLinks(POINTS, rules)).toEqual([]);
  });
});

describe('交给绘制层的最小形状', () => {
  it('toGridLinks 只留两端世界坐标（绘制层不认识 key 与规则）', () => {
    const grid = toGridLinks(LINKS);
    expect(grid).toHaveLength(LINKS.length);
    expect(grid[0]).toEqual({ from: LINKS[0]?.from, to: LINKS[0]?.to });
    expect(Object.keys(grid[0] ?? {})).toEqual(['from', 'to']);
  });

  it('端点坐标就是对应点位的世界坐标（同源，不会各算一套）', () => {
    const summit = POINTS.find((point) => point.key === 'summit');
    const eastCourt = POINTS.find((point) => point.key === 'court_1');
    const link = LINKS.find(
      (item) =>
        (item.fromKey === 'summit' && item.toKey === 'court_1') ||
        (item.fromKey === 'court_1' && item.toKey === 'summit'),
    );
    expect([link?.from, link?.to]).toEqual(
      expect.arrayContaining([summit?.world, eastCourt?.world]),
    );
  });

  it('规则表本身是数据：默认规则条数 = 5（改拓扑只改 map-catalog.ts）', () => {
    expect(MAP_LINK_RULES).toHaveLength(5);
  });
});
