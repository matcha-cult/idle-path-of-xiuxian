/**
 * `MapCanvasLegend` —— 画布图例（四态 + 四类枢纽），供**右栏与底部提示条共用**同一份数据。
 *
 * 规格来源：`14-地图画布方案探讨.md` §11.1 第 7/8 条（PoE 的右侧图例栏）。
 * 图例内容与画布**同一口径**：`state` 名字来自 `presentation.ts`，颜色只用 antd token。
 * 纯展示、受控：不读 store、不发请求。
 */
import { Flex, Typography, theme } from 'antd';
import { nodeStateLabel, type NodeVisualState } from './canvas-view.js';

export interface MapCanvasLegendProps {
  /** 是否包含「未发现」一项。默认包含（说明「不下发轮廓」的规则，见任务书 §7）。 */
  showUnknown?: boolean;
  /** 紧凑模式（底部提示条用）：一行四态，不展示枢纽类型。 */
  compact?: boolean;
}

/** 图例顺序：从「我现在在哪」到「我还没去过」（与玩家关注度一致）。 */
const STATES: readonly NodeVisualState[] = ['current', 'visited', 'known', 'unknown'];

/** 枢纽类型图例（glyph 与 `MapNodePin` 同一套）。 */
const KINDS: readonly { key: string; glyph: string; label: string }[] = [
  { key: 'waypoint', glyph: '◆', label: '传送点' },
  { key: 'secret_realm', glyph: '⚔', label: '秘境' },
  { key: 'summit', glyph: '★', label: '主峰' },
  { key: 'route', glyph: '●', label: '普通地点' },
];

/** 四态 / 四类的中文名与 glyph 是**渲染信息**，颜色才是 token。 */
function stateGlyph(state: NodeVisualState): string {
  if (state === 'current') return '◉';
  if (state === 'visited') return '●';
  if (state === 'unknown') return '○';
  return '○';
}

export function MapCanvasLegend(props: MapCanvasLegendProps) {
  const { showUnknown = true, compact = false } = props;
  const { token } = theme.useToken();
  const states = STATES.filter((state) => showUnknown || state !== 'unknown');

  const dot = (state: NodeVisualState): string =>
    state === 'current'
      ? token.colorPrimary
      : state === 'visited'
        ? token.colorSuccess
        : token.colorTextTertiary;

  return (
    <Flex
      data-testid="map-canvas-legend"
      vertical={!compact}
      gap={compact ? 12 : 4}
      wrap
      align="center"
    >
      {states.map((state) => (
        <Flex key={state} gap={6} align="center" data-testid={`map-canvas-legend-state-${state}`}>
          <span style={{ color: dot(state), fontSize: 13, lineHeight: 1 }}>{stateGlyph(state)}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {nodeStateLabel(state)}
          </Typography.Text>
        </Flex>
      ))}
      {compact
        ? null
        : KINDS.map((kind) => (
            <Flex key={kind.key} gap={6} align="center" data-testid={`map-canvas-legend-kind-${kind.key}`}>
              <span style={{ color: token.colorTextSecondary, fontSize: 13, lineHeight: 1 }}>{kind.glyph}</span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {kind.label}
              </Typography.Text>
            </Flex>
          ))}
    </Flex>
  );
}
