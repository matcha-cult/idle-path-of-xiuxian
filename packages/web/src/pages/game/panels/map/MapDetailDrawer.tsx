/**
 * `MapDetailDrawer` —— 窄屏（`<md`）的详情降级：底部 Drawer + 常驻提示条。
 *
 * 从 `MapPanel` 拆出（单文件 200 行纪律 + 单一职责）：宽屏时详情就挂在右栏，只有窄屏
 * 才需要这个抽屉（§12.2「移动端画布占满宽度」）。提示条与抽屉同生命周期，一起放这里
 * ——两者都是「面板底部」这一层的东西。
 */
import { Drawer } from 'antd';
import type { ReactNode } from 'react';
import { MapHintBar } from './MapHintBar.js';

export interface MapDetailDrawerProps {
  /** 抽屉是否打开（容器保证窄屏时才会为 true）。 */
  open: boolean;
  title: string;
  /** 是否为触屏（窄屏）布局，用于提示条文案。 */
  touch: boolean;
  /** 详情内容（宽屏同一份节点，不重复构造）。 */
  detail: ReactNode;
  onClose: () => void;
}

export function MapDetailDrawer(props: MapDetailDrawerProps) {
  const { open, title, touch, detail, onClose } = props;

  return (
    <>
      <Drawer
        data-testid="map-detail-drawer"
        title={title}
        placement="bottom"
        open={open}
        onClose={onClose}
      >
        {detail}
      </Drawer>
      <MapHintBar touch={touch} />
    </>
  );
}