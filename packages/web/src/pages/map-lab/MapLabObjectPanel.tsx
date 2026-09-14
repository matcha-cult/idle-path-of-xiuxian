/**
 * `MapLabObjectPanel` —— 右栏「本图可交互对象」总表（用户形态要求的「右边地图内可交互对象」）。
 *
 * 与旧面板的 `MapObjectList` 的差别：那里只列**当前选中节点**的职能入口；这里列**整张图**的
 * 全部可交互对象（传送点 / 秘境入口 / 职能入口），点任意一条即可把画布焦点移过去
 * —— 「进入地图之后，加载目标地图的可交互对象」要的正是这种**全图视角**。
 *
 * 纯展示 + 回调：对象清单由 `lab-objects.buildLabObjects` 在容器里算好（含会话内点亮态）；
 * 本组件不读 store、不判定可达性。
 */
import { Flex, Tag, Typography } from 'antd';
import { SectionCard } from '@idle-path/ui-kit';
import { LAB_KIND_LABELS, labKindCounts, type LabObject, type LabObjectKind } from './lab-objects.js';
import { LabObjectRow } from './LabObjectRow.js';

export interface MapLabObjectPanelProps {
  objects: readonly LabObject[];
  /** 当前选中的枢纽 code（给该处的对象加「此处」标记）。 */
  selectedNodeCode: string | null;
  onFocusNode: (nodeCode: string) => void;
}

/** 展示顺序：先传送点（跑图骨架）→ 秘境入口（玩法目标）→ 职能入口（内容）。 */
const KIND_ORDER: readonly LabObjectKind[] = ['waypoint', 'realm', 'office'];

export function MapLabObjectPanel(props: MapLabObjectPanelProps) {
  const { objects, selectedNodeCode, onFocusNode } = props;
  const counts = labKindCounts(objects);

  return (
    <SectionCard
      title="本图可交互对象"
      subtitle={`传送点 ${counts.waypoint} · 秘境入口 ${counts.realm} · 职能入口 ${counts.office}`}
    >
      {objects.length === 0 ? (
        <Typography.Text type="secondary" data-testid="map-lab-objects-empty">
          本图暂无可交互对象。
        </Typography.Text>
      ) : (
        // 真实种子下本图有 17 条对象（4 传送点 + 1 秘境入口 + 12 职能入口），全展开会把页面
        // 撑到 1100px+ 并让左侧画布与右侧动作区都滑出视野；列表自己滚，页面高度由画布决定。
        <Flex vertical gap={10} data-testid="map-lab-object-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {KIND_ORDER.map((kind) => {
            const group = objects.filter((object) => object.kind === kind);
            if (group.length === 0) return null;
            return (
              <Flex vertical gap={4} key={kind} data-testid={`map-lab-group-${kind}`}>
                <Typography.Text strong>
                  {LAB_KIND_LABELS[kind]} <Tag>{group.length}</Tag>
                </Typography.Text>
                {group.map((object) => (
                  <LabObjectRow
                    key={object.key}
                    object={object}
                    onSelectedNode={selectedNodeCode === object.nodeCode}
                    onFocusNode={onFocusNode}
                  />
                ))}
              </Flex>
            );
          })}
        </Flex>
      )}
    </SectionCard>
  );
}
