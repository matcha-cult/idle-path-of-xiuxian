/**
 * `CanvasGraphControls` —— 图原语的**缩放控件**（放大 / 缩小 / 整图复位）。
 *
 * 为什么要有它：旧实现只支持 `Ctrl+滚轮`，没有可见的缩放入口 —— 触屏（没有滚轮）与
 * 「不知道该按 Ctrl」的鼠标用户都缩不动图。三个按钮是**兜底**，滚轮与捏合仍是主路径。
 *
 * 约定：
 * - 纯受控：只回调，不知道 zoom 是多少（缩放数学在 `pose-store.ts`）；
 * - **不传 `size`**（全局 `compactAlgorithm` 恒开，见 `ui-kit/README.md` 主题决策）；
 * - 图标 + `aria-label` 双给：图标按钮没有可读文本，只靠图标对读屏器不可用。
 */
import { Button, Flex, Tooltip } from 'antd';
import { ExpandOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';

export interface CanvasGraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export function CanvasGraphControls(props: CanvasGraphControlsProps) {
  const { onZoomIn, onZoomOut, onReset } = props;
  return (
    <Flex vertical gap={4} data-testid="canvas-graph-controls" style={{ position: 'absolute', right: 8, bottom: 8 }}>
      <Tooltip title="放大">
        <Button icon={<ZoomInOutlined />} aria-label="放大" data-testid="canvas-graph-zoom-in" onClick={onZoomIn} />
      </Tooltip>
      <Tooltip title="缩小">
        <Button icon={<ZoomOutOutlined />} aria-label="缩小" data-testid="canvas-graph-zoom-out" onClick={onZoomOut} />
      </Tooltip>
      <Tooltip title="整图复位">
        <Button icon={<ExpandOutlined />} aria-label="整图复位" data-testid="canvas-graph-reset" onClick={onReset} />
      </Tooltip>
    </Flex>
  );
}
