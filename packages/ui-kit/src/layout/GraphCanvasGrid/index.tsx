/**
 * `GraphCanvasGrid` —— **开发者网格**层（交叉点点阵 + 轴标 + 网格线，跟随 `zoom`）。
 *
 * 只在 `GraphCanvas` 的 `showGrid` 为真时渲染。规格来自 `14-地图画布方案探讨.md` §13.2：
 * 点阵让人直接报出「把藏书阁挪到 (8,12)」这种坐标；正式构建默认不渲染
 * （开关在业务侧，`resolveMapDebug(env, search)`，见 web 的 `debug-flags.ts`）。
 *
 * 约定：
 * - **只影响渲染**：不参与落格、命中判定与连线派生（§13.3）；
 * - 颜色只用 antd token（`colorError` 系做「开发者红」），禁 hex；
 * - 轴标是 `0..cols` / `0..rows`（**0-based 交叉线索引**，不是 1-based）；
 * - 网格层是 SVG 的一组元素（`<g>`），**必须嵌在 `GraphCanvas` 的 `<svg>` 里**。
 */
import { theme } from 'antd';
import { axisIndexes } from '../GraphCanvas/geometry.js';

export interface GraphCanvasGridProps {
  rows: number;
  cols: number;
  cellPx: number;
  /** 轴标字号（世界坐标单位；网格随 zoom 缩放）。 */
  fontSize?: number;
}

export function GraphCanvasGrid(props: GraphCanvasGridProps) {
  const { rows, cols, cellPx, fontSize = 11 } = props;
  const { token } = theme.useToken();
  const rowsIndex = axisIndexes(rows);
  const colsIndex = axisIndexes(cols);
  const w = (colsIndex.length) * cellPx;
  const h = (rowsIndex.length) * cellPx;

  return (
    <g data-testid="graph-canvas-grid" data-grid={`${rowsIndex.length - 1}x${colsIndex.length - 1}`}>
      {rowsIndex.map((row) => (
        <line
          key={`h${row}`}
          data-testid="graph-canvas-grid-line"
          x1={0}
          y1={row * cellPx}
          x2={w}
          y2={row * cellPx}
          stroke={token.colorError}
          strokeWidth={1}
          opacity={0.18}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {colsIndex.map((col) => (
        <line
          key={`v${col}`}
          data-testid="graph-canvas-grid-line"
          x1={col * cellPx}
          y1={0}
          x2={col * cellPx}
          y2={h}
          stroke={token.colorError}
          strokeWidth={1}
          opacity={0.18}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {rowsIndex.flatMap((row) =>
        colsIndex.map((col) => (
          <circle
            key={`p${row}-${col}`}
            data-testid="graph-canvas-grid-point"
            cx={col * cellPx}
            cy={row * cellPx}
            r={2}
            fill={token.colorError}
            opacity={0.55}
          />
        )),
      )}
      {colsIndex.map((col) => (
        <text
          key={`cx${col}`}
          data-testid="graph-canvas-axis-col"
          x={col * cellPx}
          y={-6}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight={700}
          fill={token.colorError}
        >
          {col}
        </text>
      ))}
      {rowsIndex.map((row) => (
        <text
          key={`cy${row}`}
          data-testid="graph-canvas-axis-row"
          x={-8}
          y={row * cellPx + fontSize / 3}
          textAnchor="end"
          fontSize={fontSize}
          fontWeight={700}
          fill={token.colorError}
        >
          {row}
        </text>
      ))}
      <rect
        x={-16}
        y={-16}
        width={w + 32}
        height={h + 32}
        fill="none"
        stroke={token.colorError}
        strokeWidth={1.5}
        opacity={0.5}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
