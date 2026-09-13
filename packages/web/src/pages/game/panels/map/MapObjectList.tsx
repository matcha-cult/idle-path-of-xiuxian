/**
 * `MapObjectList` —— 右栏「本院职能」列表（P2.0 §3 / v3 T9）。
 *
 * 一院多职能的**明细**：节点上的 `featureKey` 是摘要（图例 / Tooltip 用），
 * 这里是具体入口（如百工院 = 丹霞院 + 百器阁）。
 *
 * 口径（本轮**只做显示 + 入口**，交互留 P2.1）：
 * - 已实现系统由客户端 `feature-registry` 判定，只给「已开放」标签（不伪造动作）；
 * - 未实现系统统一走 `FeatureGate`（「未开放」+ 禁用入口），与 P1 同一出口；
 * - 不做 `map.interact`、不做对象进度表；协议字段不上屏（`code` 只做 key/testid）。
 */
import { Button, Flex, Tag, Typography } from 'antd';
import type { MapObjectView } from '@idle-path/ionet-transport';
import { FeatureGate } from './FeatureGate.js';
import { featureIsImplemented, featureLabelOf } from './feature-registry.js';

export interface MapObjectListProps {
  /** 宿主枢纽的全部对象（由容器按 `nodeCode` 过滤后传入）。 */
  objects: readonly MapObjectView[];
  /** 宿主节点 code（只用于稳定的 testid）。 */
  hostCode: string;
}

export function MapObjectList(props: MapObjectListProps) {
  const { objects, hostCode } = props;
  if (objects.length === 0) {
    return (
      <Typography.Text type="secondary" data-testid={`map-objects-empty-${hostCode}`}>
        此处暂无职能入口。
      </Typography.Text>
    );
  }
  return (
    <Flex vertical gap={8} data-testid={`map-objects-${hostCode}`}>
      <Typography.Text strong>本院职能</Typography.Text>
      {objects.map((object) => {
        const label = featureLabelOf(object.featureKey) ?? '此地系统';
        const implemented = featureIsImplemented(object.featureKey);
        return (
          <Flex vertical gap={4} key={object.code} data-testid={`map-object-${object.code}`}>
            <Flex gap={8} align="center" wrap>
              <Typography.Text>{object.name}</Typography.Text>
              {implemented ? (
                <Tag color="success" data-testid={`map-object-open-${object.code}`}>
                  已开放：{label}
                </Tag>
              ) : null}
            </Flex>
            {object.description === null ? null : (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {object.description}
              </Typography.Text>
            )}
            {implemented ? null : (
              <FeatureGate
                label={label}
                entry={
                  <Button data-testid={`map-object-entry-${object.code}`}>进入{label}</Button>
                }
              />
            )}
          </Flex>
        );
      })}
    </Flex>
  );
}
