/**
 * `MapViewSwitch` —— 画布 / 列表视图切换（§12.2「始终保留列表视图」）。
 *
 * 单独成一个组件（而不是塞进 `MapNodeList`）是为了守住「一文件一组件」：
 * 列表视图是**兜底**，切换控件是**入口**，两者生命周期不同。
 */
import { Segmented } from 'antd';

export interface MapViewSwitchProps {
  value: 'canvas' | 'list';
  onChange: (value: 'canvas' | 'list') => void;
}

export function MapViewSwitch(props: MapViewSwitchProps) {
  return (
    <Segmented
      data-testid="map-view-switch"
      value={props.value}
      onChange={(value) => props.onChange(value === 'list' ? 'list' : 'canvas')}
      options={[
        { label: '画布', value: 'canvas' },
        { label: '列表', value: 'list' },
      ]}
    />
  );
}
