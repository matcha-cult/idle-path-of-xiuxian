/**
 * `canvas-view` 纯逻辑：四态推导 / 状态文案 / 坐标合法性 / 悬停文案 / 当前节点判定。
 *
 * 边界重点是**坐标**：缺列、越界、非整数一律判非法 —— 容器据此降级到列表视图，
 * 而不是让 `NaN` 进画布（画布会整体静默消失，没有任何报错）。
 */
import { describe, expect, it } from 'vitest';
import type { MapNodeView, NodeProgressView } from '@idle-path/ionet-transport';
import {
  LOCKED_HINT,
  isCanvasGridReady,
  isNodeInteractive,
  isNodeOnGrid,
  nodeStateLabel,
  nodeVisualState,
  pinTooltipText,
} from './canvas-view.js';

function progress(overrides: Partial<NodeProgressView> = {}): NodeProgressView {
  return { visited: false, waypointUnlocked: false, idleUnlocked: false, cleared: false, ...overrides };
}

function node(overrides: Partial<MapNodeView> = {}): MapNodeView {
  return {
    id: 1,
    code: 'n_1',
    name: '节点一',
    ring: 'peaks',
    sector: 'E',
    kind: 'route',
    featureKey: null,
    level: 1,
    threshold: 10,
    hasWaypoint: false,
    chapter: 1,
    requiresNodeCode: null,
    zoneCode: null,
    orderIndex: 1,
    gridRow: 3,
    gridCol: 4,
    description: null,
    adjacent: false,
    progress: progress(),
    ...overrides,
  };
}

describe('nodeVisualState · 四态', () => {
  it('currentCode 命中 → current（即使进度是未到达）', () => {
    expect(nodeVisualState(node({ code: 'a' }), 'a')).toBe('current');
  });

  it('已到达 → visited；未到达 → known', () => {
    expect(nodeVisualState(node({ progress: progress({ visited: true }) }), null)).toBe('visited');
    expect(nodeVisualState(node(), null)).toBe('known');
  });

  it('currentCode 为 null / 空串 / 指向别的节点时不误判 current', () => {
    expect(nodeVisualState(node({ code: 'a' }), null)).toBe('known');
    expect(nodeVisualState(node({ code: 'a' }), '')).toBe('known');
    expect(nodeVisualState(node({ code: 'a' }), 'b')).toBe('known');
  });

  it('四态文案完整（unknown 也在图例里出现，本轮服务端不下发）', () => {
    expect(nodeStateLabel('current')).toBe('当前所在');
    expect(nodeStateLabel('visited')).toBe('已到达');
    expect(nodeStateLabel('known')).toBe('已知未到达');
    expect(nodeStateLabel('unknown')).toBe('未发现');
  });
});

describe('isCanvasGridReady / isNodeOnGrid · 坐标边界', () => {
  it('行列必须是正整数', () => {
    expect(isCanvasGridReady(21, 21)).toBe(true);
    expect(isCanvasGridReady(0, 21)).toBe(false);
    expect(isCanvasGridReady(21, -1)).toBe(false);
    expect(isCanvasGridReady(Number.NaN, 21)).toBe(false);
    expect(isCanvasGridReady(21.5, 21)).toBe(false);
    expect(isCanvasGridReady(Number.POSITIVE_INFINITY, 21)).toBe(false);
  });

  it('两端索引（0 与 n）都在界内', () => {
    expect(isNodeOnGrid(node({ gridRow: 0, gridCol: 0 }), 21, 21)).toBe(true);
    expect(isNodeOnGrid(node({ gridRow: 21, gridCol: 21 }), 21, 21)).toBe(true);
  });

  it('越界（-1 / n+1）判非法', () => {
    expect(isNodeOnGrid(node({ gridRow: -1, gridCol: 0 }), 21, 21)).toBe(false);
    expect(isNodeOnGrid(node({ gridRow: 0, gridCol: 22 }), 21, 21)).toBe(false);
  });

  it('缺列 / NaN / 小数判非法（绝不进画布）', () => {
    expect(isNodeOnGrid(node({ gridRow: undefined as unknown as number }), 21, 21)).toBe(false);
    expect(isNodeOnGrid(node({ gridCol: Number.NaN }), 21, 21)).toBe(false);
    expect(isNodeOnGrid(node({ gridRow: 1.5 }), 21, 21)).toBe(false);
    // 坐标空间本身不可用时，任何节点都判非法（容器应已降级）
    expect(isNodeOnGrid(node(), 0, 0)).toBe(false);
  });
});

describe('pinTooltipText', () => {
  it('悬停文案含名字、环层中文名与状态，且不出现协议值', () => {
    const text = pinTooltipText(node({ name: '藏书阁', ring: 'inner' }), 'visited');
    expect(text).toBe('藏书阁 · 内环功能 · 已到达');
    expect(text).not.toContain('inner');
    expect(text).not.toContain('n_1');
  });

  it('未知环层回退「其他」，不回声协议原文', () => {
    expect(pinTooltipText(node({ ring: 'weird' }), 'known')).toContain('其他');
  });
});

describe('isNodeInteractive · 两态（P2.0 v3 §5）', () => {
  it('相邻 → 可交互（可直接前往）', () => {
    expect(isNodeInteractive(node({ adjacent: true }))).toBe(true);
  });

  it('不相邻但传送点已点亮 → 可交互（可传送）', () => {
    expect(
      isNodeInteractive(node({ adjacent: false, progress: progress({ waypointUnlocked: true }) })),
    ).toBe(true);
  });

  it('既不相邻、传送点又未点亮 → 不可交互（暗色 disabled）', () => {
    expect(isNodeInteractive(node({ adjacent: false }))).toBe(false);
  });

  it('战力不参与判定：threshold 高得离谱也照样可交互（v3 已删战力限制）', () => {
    expect(isNodeInteractive(node({ adjacent: true, threshold: 999999 }))).toBe(true);
  });

  it('L 提示文案存在且不含协议字段名', () => {
    expect(LOCKED_HINT).toContain('相邻');
    expect(LOCKED_HINT).not.toContain('adjacent');
    expect(LOCKED_HINT).not.toContain('waypointUnlocked');
  });
});
