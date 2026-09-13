/**
 * `MapHintBar` —— 底部**常驻提示条**（§11.1 第 9 条 / §12.3）。
 *
 * 「点击枢纽只选中、不移动」是**反直觉**的规则（PoE 里点地图节点是有动作的），
 * 必须有一条常驻文案教它，否则玩家会以为「点不动 = 坏了」。
 *
 * 文案分平台：PC 有双击直达，触屏没有；其余规则（须与传送点交互才点亮）相同。
 */
import { Typography, theme } from 'antd';

export interface MapHintBarProps {
  /** 是否触屏 / 窄屏（PC 才有「双击前往」）。 */
  touch: boolean;
}

const PC_HINT = '点击枢纽查看详情 · 双击前往 · 须在枢纽处与传送点交互方可点亮';
const TOUCH_HINT = '轻点枢纽查看详情 · 点「前往」移动 · 须在枢纽处与传送点交互方可点亮';

export function MapHintBar(props: MapHintBarProps) {
  const { token } = theme.useToken();
  return (
    <div
      data-testid="map-hint-bar"
      style={{
        background: token.colorFillQuaternary,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        padding: '6px 10px',
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {props.touch ? TOUCH_HINT : PC_HINT}
      </Typography.Text>
    </div>
  );
}
