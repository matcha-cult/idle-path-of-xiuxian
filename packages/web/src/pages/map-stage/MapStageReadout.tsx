/**
 * `MapStageReadout` —— 网格画布的**可见读数**。
 *
 * 为什么这个小条是必需品而不是装饰：纯 canvas 画出来的东西在浏览器 DevTools 里**没有 DOM**，
 * 而我看不到你的浏览器、你在页面上也查不到我画了什么 —— 双方都会退化成猜。
 * 于是把「事实」印在屏幕上：悬停格、格宽、画布 CSS 尺寸、位图尺寸、DPR、每轴线数。
 * 出问题时你把这一行原样抄给我，就能替代一轮盲猜。
 *
 * 口径：读数只在 `metrics.usable` 时给数字，空间不足一律显示 `—`，
 * **绝不显示 NaN / 0×0**（那会让人以为「画布坏了」而不是「窗口太小」）。
 *
 * `中心圆` 那一项是给这一轮的验收用的：它把「圆心在哪、直径多少」直接印出来，
 * 于是「直径 = 1 格」这条要求能在屏幕上被核对，而不是靠肉眼估。
 */
import { Space, Typography } from 'antd';
import type { GridCell, GridMetrics } from '@idle-path/ui-kit';

export interface MapStageReadoutProps {
  /** 当前悬停格（受控，来自 `CanvasGrid` 的 `onHoverCell`） */
  hover: GridCell | null;
  /** 几何与环境读数（来自 `CanvasGrid` 的 `onMetrics`）；尚未量出时为 null */
  metrics: GridMetrics | null;
}

const DASH = '—';

/** 两位补零：坐标「列 07 / 行 03」比「列 7 / 行 3」更容易和轴标对齐着看。 */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function Field(props: { name: string; value: string; testId: string }) {
  return (
    <span>
      <Typography.Text type="secondary">{props.name} </Typography.Text>
      <Typography.Text code data-testid={props.testId}>
        {props.value}
      </Typography.Text>
    </span>
  );
}

export function MapStageReadout(props: MapStageReadoutProps) {
  const { hover, metrics } = props;
  /** 几何读数只在「量出来且真的画得出网格」时才有意义；否则一律 `—`。 */
  const geom = metrics !== null && metrics.usable ? metrics : null;

  return (
    <Space wrap separator={<Typography.Text type="secondary">|</Typography.Text>}>
      <Field
        name="悬停格"
        testId="stage-hover"
        value={hover === null ? DASH : `列 ${pad2(hover.col)} / 行 ${pad2(hover.row)}`}
      />
      <Field
        name="中心圆"
        testId="stage-mark"
        value={geom === null ? DASH : `(${geom.centerX}, ${geom.centerY}) · Ø ${geom.cellPx} px`}
      />
      <Field name="格宽" testId="stage-cell" value={geom === null ? DASH : `${geom.cellPx} px`} />
      <Field
        name="画布"
        testId="stage-canvas"
        value={geom === null ? DASH : `${geom.width} × ${geom.height} CSS`}
      />
      <Field
        name="位图"
        testId="stage-bitmap"
        value={geom === null ? DASH : `${geom.bitmapWidth} × ${geom.bitmapHeight}`}
      />
      <Field name="DPR" testId="stage-dpr" value={metrics === null ? DASH : String(metrics.dpr)} />
      <Field name="每轴线" testId="stage-lines" value={geom === null ? DASH : `${geom.axisLineCount} 条`} />
    </Space>
  );
}
