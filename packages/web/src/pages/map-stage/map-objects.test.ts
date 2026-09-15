// @vitest-environment node
/**
 * `map-objects` 单测 —— 这张表的每一条都要能对回后端的 `map-nodes.json`，所以**直接读那个 JSON**
 * 核对 code 集合（不是把 17 个 code 抄一遍，那样只会把同一个错误抄两遍）。
 *
 * 覆盖的边界：未知点位 / 空数组 / 未交互与已交互 / 非传送点 / 占位标记 / 每个种类都有中文名与颜色。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAP_OBJECTS,
  NODE_POINT_MAP,
  OBJECT_KIND_COLOR,
  OBJECT_KIND_LABEL,
  canTravel,
  isInteracted,
  objectCounts,
  objectsOfPoint,
} from './map-objects.js';
import type { MapObject } from './map-objects.js';
import { resolveMapPoints, visiblePoints } from './map-points.js';

/** 后端节点表：本表的唯一真相（相对路径从 `packages/web` 出发）。 */
const NODES: { code: string; name: string; featureKey: string | null; hasWaypoint: boolean }[] = JSON.parse(
  // 从本文件出发：map-stage → pages → src → web → packages，再进 server
  readFileSync(new URL('../../../../server/prisma/seeds/game/map-nodes.json', import.meta.url), 'utf8'),
);

const nodeOf = (code: string): (typeof NODES)[number] | undefined => NODES.find((node) => node.code === code);

/** 由后端节点**派生**的那 17 个对象（占位 NPC 不在其中：它们还没有后端数据）。 */
const NODE_DERIVED = MAP_OBJECTS.filter((object) => !object.placeholder);
const gate = MAP_OBJECTS.find((object) => object.key === 'qy_gate_n') as MapObject;
const realm = MAP_OBJECTS.find((object) => object.key === 'qy_peak_xunlian') as MapObject;
const exclaim = MAP_OBJECTS.find((object) => object.key === 'qy_summit#npc') as MapObject;

describe('与后端节点表对齐', () => {
  it('⭐ 17 个派生对象的 nodeCode 都能在后端 map-nodes.json 里查到，且名称原样搬过来', () => {
    expect(NODE_DERIVED).toHaveLength(17);
    for (const object of NODE_DERIVED) {
      const node = nodeOf(object.nodeCode);
      expect(node, `后端没有节点 ${object.nodeCode}`).toBeDefined();
      expect(object.label).toBe(node?.name);
    }
  });

  it('⭐ 17 个节点一个不漏、一个不多（code 集合完全相等）', () => {
    const mapped = new Set(NODE_POINT_MAP.map((row) => row.nodeCode));
    expect([...mapped].sort()).toEqual(NODES.map((node) => node.code).sort());
    expect(NODES).toHaveLength(17);
  });

  it('⭐ hasWaypoint ⇒ 传送点；featureKey ⇒ 对应种类（口径来自后端，不是前端猜的）', () => {
    // 占位 NPC 也要挂在真实存在的节点上（不然面板会指向一个不存在的点）
    const featureKinds: Record<string, string> = {
      realm: 'realm',
      profession: 'profession',
      skill: 'skill',
      farm: 'farm',
      alchemy: 'alchemy',
      discipline: 'discipline',
      quest: 'quest',
    };
    for (const object of MAP_OBJECTS) expect(nodeOf(object.nodeCode)).toBeDefined();
    for (const object of NODE_DERIVED) {
      const node = nodeOf(object.nodeCode);
      if (node?.hasWaypoint === true) expect(object.kind).toBe('waypoint');
      else expect(object.kind).toBe(featureKinds[String(node?.featureKey)]);
      expect(object.travel).toBe(node?.hasWaypoint);
    }
    for (const object of MAP_OBJECTS.filter((item) => item.placeholder)) expect(object.kind).toBe('npc');
  });

  it('四门都是传送点，秘境入口在第八峰·后山', () => {
    expect(MAP_OBJECTS.filter((object) => object.kind === 'waypoint')).toHaveLength(4);
    expect(realm.kind).toBe('realm');
    expect(realm.pointKey).toBe('peak_8');
  });
});

describe('与前端点表对齐', () => {
  it('⭐ 每个 pointKey 都是**可见**点位；17 个可见点位一个不漏', () => {
    const visible = visiblePoints(resolveMapPoints()).map((point) => point.key);
    const mapped = new Set(NODE_POINT_MAP.map((row) => row.pointKey));
    expect([...mapped].sort()).toEqual([...visible].sort());
  });

  it('隐蔽位（四隅预留）**没有**对象（它们还不存在，不该有可交互对象）', () => {
    const hidden = resolveMapPoints().filter((point) => point.hidden === true).map((point) => point.key);
    expect(hidden).toHaveLength(4);
    for (const pointKey of hidden) expect(objectsOfPoint(pointKey)).toEqual([]);
  });

  it('对象 key 唯一（同节点多对象靠后缀区分）', () => {
    const keys = MAP_OBJECTS.map((object) => object.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('查询与门控', () => {
  it('objectsOfPoint：北门上有两个对象（传送点 + 占位 NPC）；未知点位 ⇒ 空数组', () => {
    const atGate = objectsOfPoint('gate_2').map((object) => object.key);
    expect(atGate).toContain('qy_gate_n');
    expect(atGate).toContain('qy_gate_n#npc');
    expect(objectsOfPoint('nope')).toEqual([]);
    expect(objectsOfPoint('inner_1')).toEqual([]); // 隐藏位
  });

  it('⭐ 传送解锁：必须**先交互**，且只有传送点能传送', () => {
    expect(canTravel(gate, [])).toBe(false);
    expect(canTravel(gate, ['qy_gate_n'])).toBe(true);
    expect(canTravel(gate, ['别的对象'])).toBe(false);
    // 秘境/任务即使交互过也不给传送
    expect(canTravel(realm, ['qy_peak_xunlian'])).toBe(false);
    expect(canTravel(realm, ['qy_peak_xunlian'])).toBe(false);
    expect(isInteracted(realm, ['qy_peak_xunlian'])).toBe(true);
    expect(isInteracted(realm, [])).toBe(false);
  });

  it('占位 NPC 明确标记（不让面板假装后端已经有 NPC）', () => {
    expect(exclaim.placeholder).toBe(true);
    expect(gate.placeholder).toBe(false);
    expect(MAP_OBJECTS.filter((object) => object.placeholder)).toHaveLength(2);
  });

  it('统计：总数与按种类分组（种类顺序稳定，供面板标题用）', () => {
    const counts = objectCounts();
    expect(counts.total).toBe(MAP_OBJECTS.length);
    expect(counts.kinds.find((item) => item.kind === 'waypoint')?.count).toBe(4);
    expect(counts.kinds.map((item) => item.kind)).toEqual([...new Set(MAP_OBJECTS.map((object) => object.kind))]);
    expect(counts.kinds.reduce((sum, item) => sum + item.count, 0)).toBe(counts.total);
  });

  it('每个用到的种类都有中文名与预设色（加新种类忘了补映射会被这条抓住）', () => {
    for (const object of MAP_OBJECTS) {
      expect(OBJECT_KIND_LABEL[object.kind]).toBeTruthy();
      expect(OBJECT_KIND_COLOR[object.kind]).toBeTruthy();
    }
  });
});
