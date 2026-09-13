/**
 * `GraphCanvas` —— **坐标空间 + 缩放平移**通用原语（零业务、零 store）。
 *
 * 用途：任何「交点坐标 + 连线 + 可点枢纽」的图（地图线路图、灵脉图、编辑器点阵）。
 * 坐标系见 `14-地图画布方案探讨.md` §14.1：坐标是 **0-based 交叉线索引**，`0..rows` / `0..cols`。
 *
 * 两条最容易做错的规矩：
 * 1. **两层分开缩放**（§14.3）：底图 / 连线 / 网格跟随 `zoom`；**枢纽图标恒定屏幕尺寸**
 *    （`left = col * cellPx * zoom + panX`，图标自身不缩）—— 否则缩到 fit 视图就只剩 20px，点不中。
 * 2. **点击只选中**（§12.1）：`onSelect` 只在「命中枢纽 + pointer 位移 ≤ 8px」时触发；
 *    拖动平移与点击选中用同一段 pointer 序列区分（`useGraphViewport`），不需要分平台两套判定。
 *
 * 边界（全部收敛到安全值，绝不产出 `NaN` 坐标）：`rows/cols ≤ 0`、`items=[]`、`links=[]`、
 * 重复 key（后者胜）、非法 `cellPx`、`zoom` 夹取、`links` 指向不存在的 key。
 */
import { theme } from 'antd';
import { GraphCanvasLinks } from '../GraphCanvasLinks/index.js';
import { GraphCanvasGrid } from '../GraphCanvasGrid/index.js';
import {
  coordinateLabel,
  isRenderableItem,
  itemScreenPosition,
  safeCellPx,
  worldSize,
} from './geometry.js';
import { useGraphViewport } from './use-graph-viewport.js';
import type { Point } from './use-graph-viewport.js';
import type { GraphCanvasItem, GraphCanvasProps } from './types.js';

export type {
  GraphCanvasItem,
  GraphCanvasLink,
  GraphCanvasProps,
} from './types.js';

export function GraphCanvas(props: GraphCanvasProps) {
  const { rows, cols, items: rawItems, links = [], cellPx, showGrid = false, onBackgroundClick, ariaLabel } = props;
  const { token } = theme.useToken();
  const px = safeCellPx(cellPx);
  const worldW = worldSize(cols, px);
  const worldH = worldSize(rows, px);
  // 重复 key：**后者胜**（后定义的是调用方更晚写的意图），避免重复 key 警告与两个 DOM 节点
  const items = [...new Map(rawItems.map((item) => [item.key, item])).values()];

  const viewport = useGraphViewport({
    worldW,
    worldH,
    onItemPick: (key, source) => {
      const item = items.find((entry) => entry.key === key);
      if (item !== undefined && item.disabled !== true) item.onSelect?.(source);
    },
    onBackgroundClick,
  });

  return (
    <div
      ref={viewport.ref}
      data-testid="graph-canvas"
      role="application"
      aria-label={ariaLabel ?? '图形画布'}
      onWheel={viewport.onWheel}
      onPointerDown={viewport.onPointerDown}
      onPointerMove={viewport.onPointerMove}
      onPointerUp={viewport.onPointerUp}
      onPointerCancel={viewport.cancelDrag}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        touchAction: 'none',
        cursor: 'grab',
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
      }}
    >
      <div
        data-testid="graph-canvas-world"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: worldW,
          height: worldH,
          transform: `translate(${viewport.pan.x}px, ${viewport.pan.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <svg width={worldW} height={worldH} viewBox={`0 0 ${worldW} ${worldH}`} style={{ display: 'block' }}>
          <GraphCanvasLinks items={items} links={links} cellPx={px} />
          {showGrid ? <GraphCanvasGrid rows={rows} cols={cols} cellPx={px} /> : null}
        </svg>
      </div>

      {items.map((item) => (
        <GraphCanvasPin key={item.key} item={item} px={px} viewport={viewport} showGrid={showGrid} />
      ))}
    </div>
  );
}

interface PinProps {
  item: GraphCanvasItem;
  px: number;
  viewport: { zoom: number; pan: Point };
  showGrid: boolean;
}

/** 单个枢纽：**恒定屏幕尺寸**，热区不随 zoom 变化（§14.3 / §14.6）。 */
function GraphCanvasPin(props: PinProps) {
  const { item, px, viewport, showGrid } = props;
  if (!isRenderableItem(item.row, item.col)) return null;
  const at = itemScreenPosition(item.row, item.col, px, viewport.zoom, viewport.pan.x, viewport.pan.y);
  return (
    <div
      data-graph-item={item.key}
      data-testid={`graph-canvas-item-${item.key}`}
      data-selected={item.selected === true ? 'true' : undefined}
      role="button"
      tabIndex={item.disabled === true ? -1 : 0}
      aria-label={item.title ?? item.key}
      aria-disabled={item.disabled === true ? true : undefined}
      title={item.title}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        // 键盘触发等价于轻点（没有「双击直达」这种键盘语义）
        if (item.disabled !== true) item.onSelect?.('tap');
      }}
      style={{
        position: 'absolute',
        left: at.x,
        top: at.y,
        // 只把坐标乘了 zoom，**图标自身不缩**（§14.3）
        transform: 'translate(-50%, -50%)',
        cursor: item.disabled === true ? 'not-allowed' : 'pointer',
        opacity: item.disabled === true ? 0.45 : 1,
      }}
    >
      {item.content}
      {showGrid ? (
        <span
          data-testid={`graph-canvas-item-coord-${item.key}`}
          style={{
            position: 'absolute',
            left: '50%',
            top: '100%',
            transform: 'translateX(-50%)',
            fontSize: 10,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {coordinateLabel(item.row, item.col)}
        </span>
      ) : null}
    </div>
  );
}
