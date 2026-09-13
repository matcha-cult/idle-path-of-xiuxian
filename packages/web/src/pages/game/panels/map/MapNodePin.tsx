/**
 * `MapNodePin` —— 画布上的枢纽图标：**形状即层级 + 名字写在形状下方**。
 *
 * ## 视觉规格 v2（`19-画布交互修复与视觉规格v2任务书.md` §4/§5；提议稿 `tmp/map-visual-proposal.mjs`）
 *
 * | 环层 | 形状 | 视觉直径 | 颜色（只用 antd 语义 token，禁内联 hex） |
 * | --- | --- | --- | --- |
 * | `outer` 山门 | 圆角方形 | 30 | `colorInfo` |
 * | `peaks` 八峰 | 圆形 | 32 | `colorPrimary` |
 * | `inner` 四院 | 六边形 | 32 | `colorSuccess` |
 * | `summit` 主峰 | 八角星（最大） | 40 | `colorWarning` |
 *
 * 可交互 / 不可交互**只靠饱和度（描边色 + 底色 + 名字亮度）区分**，
 * **不用虚线空心** —— 虚线空心是「占位符」的视觉语言，16/17 个点都长这样会像未完成的线框图。
 * 虚线只保留给「未探明」这一个语义（如果以后真有），不表达「不可交互」。
 *
 * ## ⚠️ 旧口径作废（重要更正）
 * `14-地图画布方案探讨.md` §11.1 第 2 条「图上不写名字」是**抄 PoE 抄错了前提**：
 * PoE 敢不写名字，是因为每种节点有**专属美术图标**，玩家靠图形识别；
 * 本仓没有美术资源，17 个点只能靠「形状 + 颜色 + 文字」区分 —— 所以名字**必须**写在形状下方。
 * （形状 30~40px 也塞不下「第八峰·历练」这种 6 字名字，写在下方是唯一可行位置。）
 *
 * 尺寸（§14.2）：热区 `MARKER_PX = 44` 恒定、不随 zoom 变化；视觉直径按环层分档（`pin-shapes.ts`）。
 * 四态仍通过 `data-state` 暴露给测试与图例，但**不再**用颜色区分三态（改用可交互性）。
 */
import { theme } from 'antd';
import type { MapNodeView } from '@idle-path/ionet-transport';
import type { NodeVisualState } from './canvas-view.js';
import {
  RING_SHAPE,
  RING_VISUAL_PX,
  polygonPoints,
  starPoints,
  tierOfRing,
  type RingTier,
} from './pin-shapes.js';

/** 缺省视觉直径（未知环层的兜底；四档分档见 `pin-shapes.ts` 的 `RING_VISUAL_PX`）。 */
export const ICON_PX = 34;
/** 点击热区（≥ 移动端推荐值，§14.2）：不随 zoom、不随环层变化。 */
export const MARKER_PX = 44;

/** antd 全量 token 的类型（避免直接 import 具体类型名）。 */
type Token = ReturnType<typeof theme.useToken>['token'];

export interface MapNodePinProps {
  node: MapNodeView;
  /** 数据四态（只用于 `data-state` 与无障碍，不再驱动配色）。 */
  state: NodeVisualState;
  /** 当前所在：视觉直径 ×1.15 + 金色光晕（§4）。 */
  emphasized?: boolean;
  /**
   * 不可交互（P2.0 v3 §5）：既不相邻、传送点又未点亮。
   * 画成**去饱和**（灰描边 + `colorFillTertiary` 底 + 暗名字），配合 `GraphCanvas` 的
   * `disabled`（跳过 onSelect）。⚠️ 当前所在节点即使 `disabled` 也保持高饱和（见 `vivid`）。
   */
  disabled?: boolean;
}

/** 环层语义色：门=`colorInfo` / 峰=`colorPrimary` / 院=`colorSuccess` / 主峰=`colorWarning`。 */
export function ringTone(token: Token, ring: RingTier): string {
  if (ring === 'outer') return token.colorInfo;
  if (ring === 'inner') return token.colorSuccess;
  if (ring === 'summit') return token.colorWarning;
  return token.colorPrimary;
}

export interface PinShapeProps {
  tier: RingTier;
  size: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  fillOpacity: number;
}

/**
 * 形状本体：门=圆角方 / 峰=圆 / 院=六边形 / 主峰=八角星（内联 `<svg>`，颜色全部来自 token）。
 * **导出给 `MapCanvasLegend` 复用** —— 图例与画布必须画同一套形状，否则图例就是在骗人。
 */
export function PinShape(props: PinShapeProps) {
  const { tier, size, stroke, strokeWidth, fill, fillOpacity } = props;
  const c = size / 2;
  const r = Math.max(1, size / 2 - strokeWidth / 2 - 1);
  const common = { fill, fillOpacity, stroke, strokeWidth };
  if (tier === 'peaks') return <circle cx={c} cy={c} r={r} {...common} />;
  if (tier === 'inner') return <polygon points={polygonPoints(c, c, r, 6)} {...common} />;
  if (tier === 'summit') return <polygon points={starPoints(c, c, r, r * 0.46, 8)} {...common} />;
  const half = r * 0.86;
  return (
    <rect x={c - half} y={c - half} width={half * 2} height={half * 2} rx={half * 0.34} {...common} />
  );
}

export function MapNodePin(props: MapNodePinProps) {
  const { node, state, emphasized = false, disabled = false } = props;
  const { token } = theme.useToken();
  const tier = tierOfRing(node.ring);
  const size = emphasized ? RING_VISUAL_PX[tier] * 1.15 : RING_VISUAL_PX[tier];
  const tone = ringTone(token, tier);
  // 高饱和 = 可交互 或 当前所在。当前节点通常 `adjacent === false`（自己不是自己的邻居），
  // 若只看 `disabled` 就会把「我站的地方」画成灰色 —— 那是错的，玩家第一眼要找的就是它。
  const vivid = !disabled || emphasized;
  const stroke = vivid ? tone : token.colorTextQuaternary;
  const strokeWidth = vivid ? 2.5 : 2;
  const fill = vivid ? tone : token.colorFillTertiary;
  const fillOpacity = vivid ? 0.2 : 1;
  const nameColor = vivid ? token.colorText : token.colorTextTertiary;
  // 光晕：当前所在 = 金色；可交互 = 该环层色；不可交互 = 无
  const halo = emphasized ? token.colorWarning : disabled ? null : tone;

  return (
    <div
      data-testid={`map-node-pin-${node.code}`}
      data-state={state}
      data-kind={node.kind}
      data-tier={tier}
      data-shape={RING_SHAPE[tier]}
      data-disabled={disabled ? 'true' : undefined}
      style={{
        position: 'relative',
        width: MARKER_PX,
        height: MARKER_PX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        data-testid={`map-node-shape-${node.code}`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        // 圆角方 / 八角星的角会略微越出外接盒，放开裁剪（热区仍是外层 44px 盒子）
        style={{ display: 'block', overflow: 'visible' }}
      >
        {halo === null ? null : (
          <circle
            data-testid={`map-node-halo-${node.code}`}
            cx={size / 2}
            cy={size / 2}
            r={size / 2 + (emphasized ? 6 : 4)}
            fill={halo}
            opacity={emphasized ? 0.25 : 0.13}
          />
        )}
        <PinShape
          tier={tier}
          size={size}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill={fill}
          fillOpacity={fillOpacity}
        />
      </svg>
      {/* 名字绝对定位在热区盒子**下方**：既让形状中心精确落在交叉点上，又不挤压形状 */}
      <span
        data-testid={`map-node-name-${node.code}`}
        style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 2,
          fontSize: 12,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          color: nameColor,
          pointerEvents: 'none',
        }}
      >
        {node.name}
      </span>
    </div>
  );
}
