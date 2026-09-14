/**
 * `lab-objects` 单测 —— 「进入地图之后加载可交互对象」的建模边界：
 * 三类来源各自的判定、悬挂对象丢弃、空输入、计数。
 */
import { describe, expect, it } from 'vitest';
import { makeNode, makeObject } from '../../../test/helpers/map-lab-fixtures.js';
import { buildLabObjects, labKindCounts, objectsOfNode, realmKeyOf, waypointKeyOf } from './lab-objects.js';

const none: ReadonlySet<string> = new Set<string>();

const NODES = [
  makeNode({ code: 'qy_gate_n', name: '北门', hasWaypoint: true, orderIndex: 1 }),
  makeNode({ code: 'qy_chuanfayuan', name: '传法院', hasWaypoint: false, featureKey: 'skill', orderIndex: 5 }),
  makeNode({ code: 'qy_houshan', name: '第八峰·后山', hasWaypoint: false, featureKey: 'realm', orderIndex: 9 }),
  makeNode({ code: 'qy_zhufeng', name: '青云主峰', hasWaypoint: false, orderIndex: 17 }),
];

const OBJECTS = [
  makeObject({ code: 'obj_cangjingge', nodeCode: 'qy_chuanfayuan', name: '藏经阁', orderIndex: 1 }),
  makeObject({ code: 'obj_chuangongya', nodeCode: 'qy_chuanfayuan', name: '传功崖', orderIndex: 2 }),
  makeObject({ code: 'obj_hushentang', nodeCode: 'qy_zhufeng', name: '护法堂', featureKey: 'waypoint', orderIndex: 1 }),
];

describe('三类来源', () => {
  it('传送点来自节点 hasWaypoint（前端派生，等后端补 waypoint 对象）', () => {
    const objects = buildLabObjects(NODES, [], none);
    const waypoints = objects.filter((object) => object.kind === 'waypoint');
    expect(waypoints).toHaveLength(1);
    expect(waypoints[0]).toMatchObject({
      key: waypointKeyOf('qy_gate_n'),
      name: '北门传送点',
      nodeCode: 'qy_gate_n',
      nodeName: '北门',
      featureKey: 'waypoint',
    });
  });

  it('秘境入口来自节点 featureKey=realm（与旧面板同一判据）', () => {
    const realms = buildLabObjects(NODES, [], none).filter((object) => object.kind === 'realm');
    expect(realms).toHaveLength(1);
    expect(realms[0]?.key).toBe(realmKeyOf('qy_houshan'));
    expect(realms[0]?.name).toBe('第八峰·后山 · 秘境石台');
  });

  it('职能对象来自服务端 game_map_objects（原样透传 name/description）', () => {
    const offices = buildLabObjects(NODES, OBJECTS, none).filter((object) => object.kind === 'office');
    expect(offices.map((object) => object.name)).toEqual(['藏经阁', '传功崖', '护法堂']);
    expect(offices[0]?.description).toBe('九层木阁，藏尽宗门功法与旧档。');
  });

  it('传送点的 done 由**本会话已交互集合**决定（未交互 → false）', () => {
    const objects = buildLabObjects(NODES, [], new Set(['qy_gate_n']));
    expect(objects.find((object) => object.kind === 'waypoint')?.done).toBe(true);
    const fresh = buildLabObjects(NODES, [], none);
    expect(fresh.find((object) => object.kind === 'waypoint')?.done).toBe(false);
  });
});

describe('去重与归类（真实种子抓出来的缺陷）', () => {
  it('服务端对象的 featureKey=realm → 归类为「秘境入口」，不掉进职能入口组', () => {
    const host = makeNode({ code: 'qy_houshan', name: '第八峰·后山', hasWaypoint: false, featureKey: 'realm' });
    const objects = buildLabObjects(
      [host],
      [makeObject({ code: 'obj_mijing_shitai', nodeCode: 'qy_houshan', name: '秘境石台', featureKey: 'realm' })],
      none,
    );
    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatchObject({ key: 'obj_mijing_shitai', kind: 'realm', name: '秘境石台' });
  });

  it('⭐ 同一 (节点, realm) 已被对象覆盖 → 不再派生，秘境石台不会出现两行', () => {
    const host = makeNode({ code: 'qy_houshan', name: '第八峰·后山', hasWaypoint: false, featureKey: 'realm' });
    const objects = buildLabObjects(
      [host],
      [makeObject({ code: 'obj_mijing_shitai', nodeCode: 'qy_houshan', featureKey: 'realm' })],
      none,
    );
    expect(objects.filter((object) => object.kind === 'realm')).toHaveLength(1);
    expect(objects.some((object) => object.key === realmKeyOf('qy_houshan'))).toBe(false);
  });

  it('节点有 realm 但没有对应对象（旧地图）→ 仍派生一行，机制不因种子差异而消失', () => {
    const host = makeNode({ code: 'qy_houshan', name: '第八峰·后山', hasWaypoint: false, featureKey: 'realm' });
    const objects = buildLabObjects([host], [], none);
    expect(objects.map((object) => object.key)).toEqual([realmKeyOf('qy_houshan')]);
  });

  it('同一 (节点, waypoint) 已被对象覆盖 → 不再派生传送点行（对象行仍以职能入口存在）', () => {
    const host = makeNode({ code: 'qy_summit', name: '青云主峰', hasWaypoint: true, featureKey: null });
    const objects = buildLabObjects(
      [host],
      [makeObject({ code: 'obj_hufatang', nodeCode: 'qy_summit', name: '护法堂', featureKey: 'waypoint' })],
      none,
    );
    // 只剩对象那一行，没有重复的 `wp:qy_summit`
    expect(objects.map((object) => object.key)).toEqual(['obj_hufatang']);
    expect(objects.some((object) => object.key === waypointKeyOf('qy_summit'))).toBe(false);
    // 有意**不**把 `waypoint` 对象重归类为「传送点」：否则四门（4）之外还会多出一个「传送点」，
    // 与「17 枢纽里 4 个门有传送点」的既有口径打架。只有 `realm` 对象才重归类。
    expect(objects[0]?.kind).toBe('office');
  });

  it('不同节点上的同名 feature 互不影响（去重键是 节点+feature，不是 feature）', () => {
    const a = makeNode({ code: 'n_a', name: '甲', hasWaypoint: false, featureKey: 'realm' });
    const b = makeNode({ code: 'n_b', name: '乙', hasWaypoint: false, featureKey: 'realm' });
    const objects = buildLabObjects(
      [a, b],
      [makeObject({ code: 'obj_a', nodeCode: 'n_a', featureKey: 'realm' })],
      none,
    );
    expect(objects.filter((object) => object.kind === 'realm').map((object) => object.key).sort()).toEqual([
      'obj_a',
      realmKeyOf('n_b'),
    ]);
  });
});

describe('边界', () => {
  it('宿主节点未下发的职能对象 → 整条丢弃（不造点、不回显 code）', () => {
    const dangling = makeObject({ code: 'obj_ghost', nodeCode: 'qy_deleted', name: '不存在' });
    const objects = buildLabObjects(NODES, [dangling], none);
    expect(objects.some((object) => object.key === 'obj_ghost')).toBe(false);
  });

  it('空输入 → 空数组', () => {
    expect(buildLabObjects([], [], none)).toEqual([]);
  });

  it('没有 hasWaypoint / realm 的图只产出职能对象', () => {
    const hosts = [
      makeNode({ code: 'qy_chuanfayuan', name: '传法院', hasWaypoint: false }),
      makeNode({ code: 'qy_zhufeng', name: '青云主峰', hasWaypoint: false }),
    ];
    const objects = buildLabObjects(hosts, OBJECTS, none);
    expect(objects.filter((object) => object.kind !== 'office')).toEqual([]);
    expect(objects).toHaveLength(OBJECTS.length);
  });
});

describe('objectsOfNode / labKindCounts', () => {
  const all = buildLabObjects(NODES, OBJECTS, none);

  it('按宿主节点过滤（右栏「此处可交互」）', () => {
    expect(objectsOfNode(all, 'qy_chuanfayuan').map((object) => object.name)).toEqual(['藏经阁', '传功崖']);
    expect(objectsOfNode(all, 'qy_gate_n')).toHaveLength(1);
    expect(objectsOfNode(all, 'qy_not_here')).toEqual([]);
  });

  it('计数按 kind 汇总，总和等于列表长度', () => {
    const counts = labKindCounts(all);
    expect(counts.waypoint).toBe(1);
    expect(counts.realm).toBe(1);
    expect(counts.office).toBe(3);
    expect(counts.waypoint + counts.realm + counts.office).toBe(all.length);
  });

  it('空列表计数全 0（不抛错）', () => {
    expect(labKindCounts([])).toEqual({ waypoint: 0, realm: 0, office: 0 });
  });
});
