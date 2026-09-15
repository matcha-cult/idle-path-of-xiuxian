/**
 * `MapStageObjectPanel` —— 右侧「地图内可交互对象」面板（北极星里 PC 端的右半屏：
 * 「左边地图网格，右边地图内可交互对象」）。
 *
 * ## 受控：状态全在页面
 * 选中哪个点、哪些对象交互过、最近一次动作的结果，都由页面给；本组件不存状态
 * （与 `MapStageReadout` / `CanvasGrid` 同一口径）。交互链路是**双向**的：
 * 左边点画布 → 右边只列这个点的对象；右边点对象名 → 左边选中那个点（`onSelectPoint`）。
 *
 * ## 传送的门槛只显示、不判定
 * 「必须和传送点交互之后才可解锁传送」的口径写在 `map-objects.ts` 的 `canTravel()`（纯函数、
 * 有单测）。这里只把它**显示**出来：未交互 ⇒ 按钮禁用 + 一行说明为什么，免得用户以为坏了。
 *
 * ## 数据来源
 * 默认读 `MAP_OBJECTS`（照搬后端 `map-nodes.json`：`hasWaypoint` ⇒ 传送点、`featureKey` ⇒
 * 秘境/传承/功法……）。`objects` 可覆盖，便于单测空态与"点位没有对象"的边界。
 */
import { Button, Card, Empty, Space, Tag, Typography, theme } from 'antd';
import { MAP_OBJECTS, OBJECT_KIND_COLOR, OBJECT_KIND_LABEL, canTravel, isInteracted } from './map-objects.js';
import type { MapObject } from './map-objects.js';
import type { ResolvedMapPoint } from './map-points.js';

export interface MapStageObjectPanelProps {
  /** 已解析的点位（用来把 pointKey 显示成人话，并判断选中点是否存在） */
  points: readonly ResolvedMapPoint[];
  /** 当前选中的点位 key（画布与面板共用同一个选中态） */
  selectedKey: string | null;
  /** 已交互过的对象 key */
  interacted: readonly string[];
  /** 最近一次交互/传送的结果（页面维护；null = 还没动作） */
  notice?: string | null;
  /** 覆盖对象表（默认 `MAP_OBJECTS`）；单测用 */
  objects?: readonly MapObject[];
  onSelectPoint: (key: string | null) => void;
  onInteract: (objectKey: string) => void;
  onTravel: (objectKey: string) => void;
}

export function MapStageObjectPanel(props: MapStageObjectPanelProps) {
  const { token } = theme.useToken();
  const all = props.objects ?? MAP_OBJECTS;
  const selected =
    props.selectedKey === null ? null : (props.points.find((point) => point.key === props.selectedKey) ?? null);
  // 没选中点位 ⇒ 加载本地图的**全部**可交互对象（北极星：进入地图后就能看到有什么可交互）
  const objects = selected === null ? all : all.filter((object) => object.pointKey === selected.key);
  const labelOf = (pointKey: string): string =>
    props.points.find((point) => point.key === pointKey)?.label ?? pointKey;

  return (
    <Card
      variant="outlined"
      title="地图内可交互对象"
      extra={<Tag data-testid="object-panel-count">{`${all.length} 个`}</Tag>}
    >
      <Space orientation="vertical" size={token.paddingXS} style={{ width: '100%' }}>
        {selected === null ? (
          <Typography.Text type="secondary" data-testid="object-panel-hint">
            未选中点位 ⇒ 列出全部对象（其中 {all.filter((object) => object.travel).length} 个传送点）。
            点左边网格里的点，或点下面任一对象的名字，可以只看那一个点位。
          </Typography.Text>
        ) : (
          <Space wrap data-testid="object-panel-selected">
            <Tag color="blue">{selected.label}</Tag>
            <Typography.Text code>{selected.key}</Typography.Text>
            <Typography.Text type="secondary">环 {selected.ring}</Typography.Text>
            <Button type="link" data-testid="object-panel-clear" onClick={() => props.onSelectPoint(null)}>
              取消选择
            </Button>
          </Space>
        )}

        {props.notice === null || props.notice === undefined ? null : (
          <Typography.Text type="success" data-testid="object-panel-notice">
            {props.notice}
          </Typography.Text>
        )}

        {objects.length === 0 ? (
          <Empty description="这个点位没有可交互对象" />
        ) : (
          objects.map((object) => {
            const done = isInteracted(object, props.interacted);
            const unlocked = canTravel(object, props.interacted);
            return (
              <div
                key={object.key}
                data-testid={`object-${object.key}`}
                style={{
                  border: `1px solid ${done ? token.colorSuccessBorder : token.colorBorderSecondary}`,
                  borderRadius: token.borderRadius,
                  padding: token.paddingXS,
                }}
              >
                <Space orientation="vertical" size={token.paddingXXS} style={{ width: '100%' }}>
                  <Space wrap>
                    <Tag color={OBJECT_KIND_COLOR[object.kind]}>{OBJECT_KIND_LABEL[object.kind]}</Tag>
                    <Button
                      type="link"
                      data-testid={`object-goto-${object.key}`}
                      onClick={() => props.onSelectPoint(object.pointKey)}
                    >
                      {object.label}
                    </Button>
                    {selected === null ? (
                      <Typography.Text type="secondary">{`在 ${labelOf(object.pointKey)}`}</Typography.Text>
                    ) : null}
                    {object.placeholder ? <Tag data-testid={`object-placeholder-${object.key}`}>占位</Tag> : null}
                    {done ? (
                      <Tag color="green" data-testid={`object-done-${object.key}`}>
                        已交互
                      </Tag>
                    ) : null}
                  </Space>

                  <Typography.Text type="secondary">{object.detail}</Typography.Text>

                  <Space wrap>
                    <Button
                      type="primary"
                      disabled={done}
                      data-testid={`object-interact-${object.key}`}
                      onClick={() => props.onInteract(object.key)}
                    >
                      交互
                    </Button>
                    {object.travel ? (
                      <Button
                        disabled={!unlocked}
                        data-testid={`object-travel-${object.key}`}
                        onClick={() => props.onTravel(object.key)}
                      >
                        传送
                      </Button>
                    ) : null}
                    {object.travel && !unlocked ? (
                      <Typography.Text type="secondary" data-testid={`object-locked-${object.key}`}>
                        须先与传送点交互
                      </Typography.Text>
                    ) : null}
                  </Space>
                </Space>
              </div>
            );
          })
        )}
      </Space>
    </Card>
  );
}
