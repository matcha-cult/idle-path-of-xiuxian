/**
 * `MapStageReadout` —— 网格画布的**可见读数**。
 *
 * 为什么这个小条是必需品而不是装饰：纯 canvas 画出来的东西在浏览器 DevTools 里**没有 DOM**，
 * 而我看不到你的浏览器、你在页面上也查不到我画了什么 —— 双方都会退化成猜。
 * 于是把「事实」印在屏幕上：悬停格、世界原点落在画布哪一点、格宽、画布/位图尺寸、DPR、
 * 每轴线数，以及**全部点位的坐标**（点位是这一轮的交付物，坐标就是它的验收物）。
 *
 * 口径：读数只在 `metrics.usable` 时给数字，空间不足一律显示 `—`，
 * **绝不显示 NaN / 0×0**（那会让人以为「画布坏了」而不是「窗口太小」）。
 */
import { Space, Tag, Typography, theme } from 'antd';
import type { GridCell, GridMetrics } from '@idle-path/ui-kit';
import { PEAK_PHASE_DEG } from './map-points.js';
import type { MapRing, ResolvedMapPoint } from './map-points.js';

export interface MapStageReadoutProps {
  /** 当前悬停格（受控，来自 `CanvasGrid` 的 `onHoverCell`） */
  hover: GridCell | null;
  /** 几何与环境读数（来自 `CanvasGrid` 的 `onMetrics`）；尚未量出时为 null */
  metrics: GridMetrics | null;
  /** 已解析的点位（含派生世界坐标与世界原点的格点口径） */
  points: readonly ResolvedMapPoint[];
  /** 当前生效的环表（半径可能被滑杆改过 —— 读数必须报**当前值**，不是默认值） */
  rings: readonly MapRing[];
}

const DASH = '—';

/** 两位补零：坐标「列 07 / 行 03」比「列 7 / 行 3」更容易和轴标对齐着看。 */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 世界坐标显示：整数就只显示整数，斜向峰保留 1 位小数（6.3639… → 6.4）。 */
function round1(value: number): string {
  return String(Math.round(value * 10) / 10);
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
  const { hover, metrics, points, rings } = props;
  const { token } = theme.useToken();
  /** 几何读数只在「量出来且真的画得出网格」时才有意义；否则一律 `—`。 */
  const geom = metrics !== null && metrics.usable ? metrics : null;
  const peaks = points.filter((point) => point.kind === 'peak');
  const gates = points.filter((point) => point.kind === 'gate');
  /**
   * 环读数**从当前环表算**（不是硬编码常量）：滑杆一改，这里立刻跟着变 ——
   * 否则读数会在调半径时骗人（那是比没有读数更糟的情况）。
   */
  const ringText = rings
    .map((ring) => {
      const count = points.filter((point) => point.ring === ring.key).length;
      const style = ring.dashed === true ? '虚线' : '实线';
      return `${ring.label} r${round1(ring.radiusCells)}（${style}）×${count}`;
    })
    .join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: token.paddingXS }}>
      <Space wrap separator={<Typography.Text type="secondary">|</Typography.Text>}>
        <Field
          name="悬停格"
          testId="stage-hover"
          value={hover === null ? DASH : `列 ${pad2(hover.col)} / 行 ${pad2(hover.row)}`}
        />
        <Field
          name="世界原点"
          testId="stage-origin"
          value={geom === null ? DASH : `(${geom.centerX}, ${geom.centerY}) px`}
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
        <Field name="环" testId="stage-rings" value={ringText} />
      </Space>

      <Space wrap data-testid="stage-points">
        {points.map((point) => (
          <Tag key={point.key} data-testid={`stage-point-${point.key}`}>
            {point.label} ({round1(point.world.x)}, {round1(point.world.y)})
          </Tag>
        ))}
      </Space>

      <Typography.Text type="secondary" data-testid="stage-points-note">
        共 {points.length} 个点位（{peaks.length} 个八峰按 8 等分排在二环上、相位 {PEAK_PHASE_DEG}
        ° ⇒ 错开半个扇区，把四个正方向让给 {gates.length} 座宗门门），每个点都画成直径 1 格的实心圆。
        坐标是**世界口径**（原点 = 主峰、y 向上、单位 = 格），由「环 + 角度」算出来、不落库：
        八峰的格点坐标**全是小数**（如 列 29.31 / 行 17.56），这正是它们不能被存成整数格点的原因。
        滑杆只改本次会话的圆；定稿后把数字发我，我写进数据表。
      </Typography.Text>
    </div>
  );
}
