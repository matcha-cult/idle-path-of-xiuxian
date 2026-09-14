/**
 * `FrameMeter` —— 帧率读数（**纯展示**：数字由容器采集后传入）。
 *
 * 用途：让「手感」在真机上可读。用户拖动 / 缩放时盯着这块读数，掉帧会立刻反映成
 * `掉帧 N` 与 `最差 M ms`，不必靠"感觉卡不卡"来描述。
 *
 * 展示口径：
 * - 掉帧为 0 时用成功色，> 0 时用警告色（颜色只走 antd token / 语义色名，禁内联 hex）；
 * - `frames = 0`（还没测到帧）时显示「等待操作」，避免把 0 FPS 当成卡死；
 * - 有「复位」按钮：换一种手势前后分开看，比累计读数有用。
 */
import { Button, Flex, Tag, Typography } from 'antd';
import type { FrameSummary } from './frame-stats.js';

export interface FrameMeterProps {
  summary: FrameSummary;
  onReset: () => void;
}

export function FrameMeter(props: FrameMeterProps) {
  const { summary, onReset } = props;
  const idle = summary.frames === 0;
  return (
    <Flex
      gap={8}
      align="center"
      wrap
      data-testid="map-lab-frame-meter"
      data-dropped={summary.dropped}
      data-frames={summary.frames}
    >
      <Typography.Text strong style={{ fontSize: 12 }}>
        帧率
      </Typography.Text>
      {idle ? (
        <Tag data-testid="map-lab-frame-meter-idle">等待操作</Tag>
      ) : (
        <>
          <Tag color={summary.dropped === 0 ? 'success' : 'warning'} data-testid="map-lab-frame-meter-fps">
            {summary.fps.toFixed(0)} FPS
          </Tag>
          <Typography.Text type="secondary" style={{ fontSize: 12 }} data-testid="map-lab-frame-meter-detail">
            窗口 {summary.frames} 帧 · 掉帧 {summary.dropped} · 最差 {summary.worstMs.toFixed(1)} ms · 平均{' '}
            {summary.avgMs.toFixed(1)} ms
          </Typography.Text>
        </>
      )}
      <Button data-testid="map-lab-frame-meter-reset" onClick={onReset}>
        复位
      </Button>
    </Flex>
  );
}
