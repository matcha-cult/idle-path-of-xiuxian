/**
 * `MapStageRingSliders` —— **每个环一条滑杆**，调的是「这一环离中心多少格」。
 *
 * 为什么值得单独做：环的半径是这张图最需要"手感"的数字之一（外环/二环/内环挤在一起还是
 * 拉开，只有看着才知道），而我看不到浏览器。有了滑杆，调半径这件事就从
 * 「说一个数 → 我改代码 → 你刷新 → 再看」变成「你直接拖」——一轮沟通省掉三次往返。
 *
 * 口径：
 * - 值 = **格**（与坐标、格子同一把尺子），范围 `[0, 半幅]`、步长 0.5；
 * - 只改**会话态**：刷新回到数据表里的默认值。定稿后把满意的数字写回 `map-points.ts`，
 *   那里才是持久化的位置（因此本组件不需要「保存」按钮）；
 * - 中心（主峰）固定半径 0，不给滑杆 —— 免得把地图原点拖走；
 * - 键盘可调（antd Slider 默认 `keyboard`）：左右方向键走一步，这也让 jsdom 能测它。
 */
import { Slider, Typography, theme } from 'antd';
import { MapStageRingExport } from './MapStageRingExport.js';
import { RING_RADIUS_LIMITS } from './map-points.js';
import type { MapRing } from './map-points.js';

export interface MapStageRingSlidersProps {
  /** 可调的环（中心那种 `fixed` 的环由调用方先滤掉） */
  rings: readonly MapRing[];
  onChange: (ringKey: string, radiusCells: number) => void;
}

export function MapStageRingSliders(props: MapStageRingSlidersProps) {
  const { rings, onChange } = props;
  const { token } = theme.useToken();
  const { min, max, step } = RING_RADIUS_LIMITS;

  return (
    <div data-testid="stage-ring-sliders" style={{ display: 'flex', flexDirection: 'column', gap: token.paddingXS }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: token.padding }}>
        <Typography.Text type="secondary">
          环半径（格）— 拖动即可改本次会话的圆；满意后点右侧按钮：会复制一段可直接贴回数据表的常量，并同时打到浏览器控制台（刷新会回到默认值）
        </Typography.Text>
        <MapStageRingExport rings={rings} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: token.padding }}>
        {rings.map((ring) => (
          <div
            key={ring.key}
            style={{ display: 'flex', alignItems: 'center', gap: token.paddingXS, width: 320 }}
          >
            <Typography.Text type="secondary" style={{ width: 92 }}>
              {ring.label}
            </Typography.Text>
            <Slider
              style={{ flex: 1, margin: 0 }}
              min={min}
              max={max}
              step={step}
              value={ring.radiusCells}
              onChange={(value) => onChange(ring.key, value)}
            />
            <Typography.Text
              code
              data-testid={`ring-value-${ring.key}`}
              style={{ width: 60, textAlign: 'right' }}
            >
              {ring.radiusCells} 格
            </Typography.Text>
          </div>
        ))}
      </div>
    </div>
  );
}
