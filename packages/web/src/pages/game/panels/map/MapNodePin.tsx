/**
 * `MapNodePin` —— 画布上的**纯圆形枢纽图标**（图上**不写名字**，名字只在悬停 Tooltip 与右栏）。
 *
 * 规格来源：`14-地图画布方案探讨.md` §11.1 第 2 条 / §11.6。四态靠**亮度 / 描边色 / 尺寸**区分，
 * `kind` 用 glyph 区分（传送点 ◆ / 秘境 ⚔ / 主峰 ★ / 普通 ●）。
 *
 * 尺寸（§14.2）：视觉直径 `ICON_PX = 34`、热区 `MARKER_PX = 44`；热区不随 zoom 变化，
 * 因为画布把图标放在**不缩放的层**里（见 `GraphCanvas`）。颜色只用 antd token，禁 hex。
 */
import { theme } from 'antd';
import type { MapNodeView } from '@idle-path/ionet-transport';
import type { NodeVisualState } from './canvas-view.js';

/** 视觉直径（§14.2）。 */
export const ICON_PX = 34;
/** 点击热区（≥ 移动端推荐值，§14.2）。 */
export const MARKER_PX = 44;

export interface MapNodePinProps {
  node: MapNodeView;
  state: NodeVisualState;
  /** 当前所在节点额外放大（§11.1 第 11 条：状态靠尺寸/亮度区分）。 */
  emphasized?: boolean;
}

/** `kind` → glyph（四类；未知 kind 用空以免上屏协议原文）。 */
function glyphOf(kind: string): string {
  if (kind === 'secret_realm') return '⚔';
  if (kind === 'summit') return '★';
  if (kind === 'route') return '';
  return '';
}

export function MapNodePin(props: MapNodePinProps) {
  const { node, state, emphasized = false } = props;
  const { token } = theme.useToken();
  const size = emphasized ? ICON_PX + 8 : ICON_PX;

  const ring =
    state === 'current'
      ? token.colorPrimary
      : state === 'visited'
        ? token.colorSuccess
        : state === 'unknown'
          ? token.colorTextQuaternary
          : token.colorTextTertiary;
  const fill = state === 'visited' ? token.colorSuccessBg : token.colorBgElevated;
  const textColor = state === 'current' ? token.colorPrimary : token.colorTextSecondary;

  return (
    <div
      data-testid={`map-node-pin-${node.code}`}
      data-state={state}
      data-kind={node.kind}
      style={{
        position: 'relative',
        width: MARKER_PX,
        height: MARKER_PX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: fill,
          border: `${emphasized ? 3 : 2}px ${state === 'known' ? 'dashed' : 'solid'} ${ring}`,
          boxShadow: state === 'current' ? `0 0 12px ${token.colorPrimaryBorder}` : undefined,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: textColor,
          fontSize: 15,
          lineHeight: 1,
        }}
      >
        {glyphOf(node.kind)}
      </div>
    </div>
  );
}
