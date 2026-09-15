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
import { PEAK_PHASE_DEG, hiddenPoints, linkBreakdown, visiblePoints } from './map-points.js';
import type { MapRing, ResolvedMapLink, ResolvedMapPoint } from './map-points.js';

export interface MapStageReadoutProps {
  /** 当前悬停格（受控，来自 `CanvasGrid` 的 `onHoverCell`） */
  hover: GridCell | null;
  /** 几何与环境读数（来自 `CanvasGrid` 的 `onMetrics`）；尚未量出时为 null */
  metrics: GridMetrics | null;
  /** 已解析的点位（含派生世界坐标与世界原点的格点口径） */
  points: readonly ResolvedMapPoint[];
  /** 当前生效的环表（半径可能被滑杆改过 —— 读数必须报**当前值**，不是默认值） */
  rings: readonly MapRing[];
  /** 当前生效的连接线（由规则算出；半径一改就变） */
  links: readonly ResolvedMapLink[];
  /** 当前**悬停**的点 key（来自 `CanvasGrid` 的 `onHoverMark`） */
  hoverMark: string | null;
  /** 当前**选中**的点 key（来自 `CanvasGrid` 的 `onMarkClick`；点空白 ⇒ null） */
  selectedMark: string | null;
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

/**
 * 两位小数 —— 说明里举的"格点是小数的例子"用它**现算**，不写死。
 *
 * 教训：这里原来硬写着「如 列 29.31 / 行 17.56」（那是 r=9 时的值）。数据一改，页面上就挂着
 * 一句过期的假话 —— 而**没有任何东西会报错**。凡是"举例的数字"，都必须从当前数据算。
 */
function round2(value: number): string {
  return String(Math.round(value * 100) / 100);
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
  const { hover, metrics, points, rings, links, hoverMark, selectedMark } = props;
  const { token } = theme.useToken();
  /** 几何读数只在「量出来且真的画得出网格」时才有意义；否则一律 `—`。 */
  const geom = metrics !== null && metrics.usable ? metrics : null;
  const peaks = points.filter((point) => point.kind === 'peak');
  const gates = points.filter((point) => point.kind === 'gate');
  /** 渲染的 / 只在数据里的（读数把两类都列出来 —— 隐藏位要"看得见它存在"）。 */
  const shown = visiblePoints(points);
  const hidden = hiddenPoints(points);
  /**
   * 悬停 / 选中的点的**资料行**（这是"点成为可交互对象"之后要看得见的东西）：
   * 名字 + key（我按 key 沟通/写数据）+ 世界坐标 + 格点口径 + 归属环。
   */
  const describePoint = (key: string | null): string => {
    const point = key === null ? undefined : points.find((item) => item.key === key);
    if (point === undefined) return DASH;
    const world = `(${round1(point.world.x)}, ${round1(point.world.y)})`;
    const lattice = `列 ${round2(point.lattice.col)} 行 ${round2(point.lattice.row)}`;
    return `${point.label} [${point.key}] · 世界 ${world} · 格点 ${lattice} · 环 ${point.ring}`;
  };
  /** 连接线读数：总数 + 按规则分组（规则名与条数都从当前边上算，滑杆一改跟着变）。 */
  const linkText = `${links.length} 条（${linkBreakdown(links)
    .map((item) => `${item.rule} ${item.count}`)
    .join(' · ')}）`;
  /**
   * 环读数**从当前环表算**（不是硬编码常量）：滑杆一改，这里立刻跟着变 ——
   * 否则读数会在调半径时骗人（那是比没有读数更糟的情况）。隐藏位单独标 `+N隐藏`，
   * 免得"内环 8 个位置只报了 4 个"看起来像丢数据。
   */
  const ringText = rings
    .map((ring) => {
      const count = shown.filter((point) => point.ring === ring.key).length;
      const hiddenCount = hidden.filter((point) => point.ring === ring.key).length;
      const style = ring.dashed === true ? '虚线' : '实线';
      const suffix = hiddenCount > 0 ? `+${hiddenCount}隐藏` : '';
      return `${ring.label} r${round1(ring.radiusCells)}（${style}）×${count}${suffix}`;
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
        <Field name="连接" testId="stage-links" value={linkText} />
      </Space>

      <Space wrap separator={<Typography.Text type="secondary">|</Typography.Text>}>
        <Field name="悬停点" testId="stage-hover-mark" value={describePoint(hoverMark)} />
        <Field name="选中点" testId="stage-selected-mark" value={describePoint(selectedMark)} />
        <Typography.Text type="secondary">（鼠标移到点上会亮；点一下选中，点空白取消）</Typography.Text>
      </Space>

      <Space wrap data-testid="stage-points">
        {shown.map((point) => (
          <Tag key={point.key} data-testid={`stage-point-${point.key}`}>
            {point.label} ({round1(point.world.x)}, {round1(point.world.y)})
          </Tag>
        ))}
      </Space>

      {hidden.length > 0 ? (
        <Space wrap data-testid="stage-hidden-points">
          <Typography.Text type="secondary">隐藏（数据保留、不渲染）：</Typography.Text>
          {hidden.map((point) => (
            <Tag key={point.key} data-testid={`stage-hidden-${point.key}`}>
              {point.label} ({round1(point.world.x)}, {round1(point.world.y)})
            </Tag>
          ))}
        </Space>
      ) : null}

      <Typography.Text type="secondary" data-testid="stage-points-note">
        共 {points.length} 个点位 = {shown.length} 个渲染 + {hidden.length} 个隐藏（隐藏位只关渲染、
        数据仍在：以后启用它们只需去掉一个 hidden）。{peaks.length} 个八峰按 8 等分排在二环、相位{' '}
        {PEAK_PHASE_DEG}°（错开半个扇区，四正方向让给 {gates.length} 座宗门门）；内环 8 等分里
        四正是四院、四隅是预留位。每个点都画成直径 1 格的实心圆。坐标是**世界口径**（原点 = 主峰、
        y 向上、单位 = 格），由「环 + 角度」算出来、不落库：八峰的格点坐标**全是小数**（如 列{' '}
        {round2(peaks[0]?.lattice.col ?? 0)} / 行 {round2(peaks[0]?.lattice.row ?? 0)}），
        这正是它们不能被存成整数格点的原因。滑杆只改本次会话的圆；定稿后点上面的「复制环半径」按钮
        导出，贴给开发者写回数据表。
      </Typography.Text>
    </div>
  );
}
