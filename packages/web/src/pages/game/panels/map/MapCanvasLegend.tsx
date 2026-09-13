/**
 * `MapCanvasLegend` —— 画布图例，**与画布同一套视觉语言**（`19-...任务书.md` §4/§5）。
 *
 * ⚠️ 视觉规格 v2 起旧图例（四态 + 四类 glyph）已经**描述不了画布**：
 * `MapNodePin` 不再用 glyph 区分类型、也不再按 current/visited/known 配色。
 * 所以本组件重写为两段：
 *   1. **环层 = 形状 + 语义色**（门圆角方 / 峰圆 / 院六边形 / 主峰八角星）—— 形状复用 `PinShape`，
 *      图例与画布永远是同一套几何；
 *   2. **可交互性 = 饱和度**（当前所在金色光晕 / 可交互高饱和实线 / 不可交互去饱和实线）。
 *
 * `compact`（列表视图头部）只留可交互性一段 —— 列表视图里没有形状，列环层形状只会误导。
 * 纯展示、受控：不读 store、不发请求；协议值不上屏。
 */
import { Flex, Typography, theme } from 'antd';
import { PinShape, ringTone } from './MapNodePin.js';
import { RING_SHAPE_LABEL, RING_TIERS, type RingTier } from './pin-shapes.js';
import { ringLabel } from './presentation.js';

export interface MapCanvasLegendProps {
  /** 紧凑模式（列表视图头部用）：只列可交互性，不列环层形状。 */
  compact?: boolean;
}

type Token = ReturnType<typeof theme.useToken>['token'];

/** 图例缩略图边长（形状与画布同源，只是小一号）。 */
const GLYPH_PX = 14;

/** 可交互性三态（视觉 v2：不再按 visited/known 配色）。 */
const LEGEND_STATES: readonly { key: string; label: string }[] = [
  { key: 'current', label: '当前所在（金色光晕）' },
  { key: 'interactive', label: '可交互（高饱和实线）' },
  { key: 'locked', label: '不可交互（去饱和实线）' },
];

/** 可交互性圆点色：当前=金 / 可交互=主色 / 不可交互=去饱和。 */
function stateDot(token: Token, key: string): string {
  if (key === 'current') return token.colorWarning;
  if (key === 'interactive') return token.colorPrimary;
  return token.colorTextQuaternary;
}

/** 环层缩略图：形状与颜色都来自画布那一套（`PinShape` + `ringTone`）。 */
function RingGlyph({ token, tier }: { token: Token; tier: RingTier }) {
  const tone = ringTone(token, tier);
  return (
    <svg width={GLYPH_PX} height={GLYPH_PX} viewBox={`0 0 ${GLYPH_PX} ${GLYPH_PX}`} aria-hidden="true">
      <PinShape
        tier={tier}
        size={GLYPH_PX}
        stroke={token.colorTextSecondary}
        strokeWidth={1.5}
        fill={tone}
        fillOpacity={0.85}
      />
    </svg>
  );
}

export function MapCanvasLegend(props: MapCanvasLegendProps) {
  const { compact = false } = props;
  const { token } = theme.useToken();

  return (
    <Flex
      data-testid="map-canvas-legend"
      vertical={!compact}
      gap={compact ? 12 : 4}
      wrap
      align="center"
    >
      {compact
        ? null
        : RING_TIERS.map((tier) => (
            <Flex key={tier} gap={6} align="center" data-testid={`map-canvas-legend-ring-${tier}`}>
              <RingGlyph token={token} tier={tier} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {ringLabel(tier)}（{RING_SHAPE_LABEL[tier]}）
              </Typography.Text>
            </Flex>
          ))}
      {LEGEND_STATES.map((state) => (
        <Flex key={state.key} gap={6} align="center" data-testid={`map-canvas-legend-state-${state.key}`}>
          <span style={{ color: stateDot(token, state.key), fontSize: 13, lineHeight: 1 }}>●</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {state.label}
          </Typography.Text>
        </Flex>
      ))}
    </Flex>
  );
}
