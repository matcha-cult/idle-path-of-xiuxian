/**
 * `MapToolbar` —— 地图面板顶部工具条（换图 / 画布⇄列表 / 刷新）。
 *
 * 从 `MapPanel` 拆出（单文件 200 行纪律 + 单一职责）：纯展示 + 回调，不读 store。
 * 换图下拉只在**存在多张图**时出现（当前只有青云宗，故通常不渲染）。
 */
import { Button, Flex, Segmented } from 'antd';
import { MapViewSwitch, type MapViewSwitchProps } from './MapViewSwitch.js';

/** 视图模式（复用 `MapViewSwitch` 的取值联合，避免两处各写一份字面量）。 */
export type MapViewMode = MapViewSwitchProps['value'];

export interface MapToolbarProps {
  maps: readonly { code: string; name: string }[];
  selectedMapCode: string | null;
  onSelectMap: (code: string) => void;
  view: MapViewMode;
  onViewChange: (view: MapViewMode) => void;
  onRefresh: () => void;
}

export function MapToolbar(props: MapToolbarProps) {
  const { maps, selectedMapCode, onSelectMap, view, onViewChange, onRefresh } = props;

  return (
    <Flex gap={8} wrap align="center">
      {maps.length > 1 ? (
        <Segmented
          value={selectedMapCode ?? undefined}
          onChange={(value) => onSelectMap(String(value))}
          options={maps.map((entry) => ({ label: entry.name, value: entry.code }))}
        />
      ) : null}
      <MapViewSwitch value={view} onChange={onViewChange} />
      <Button onClick={onRefresh} data-testid="map-refresh">
        刷新地图
      </Button>
    </Flex>
  );
}