/**
 * `WaypointInteractCard` —— 「与传送点交互」的动作面（用户原始意图的落点）。
 *
 * 用户原话（2026-09-14）：「**必须和传送点交互之后才可解锁传送**。」
 *
 * 三种可见形态（判定全在 `waypoint-gate.ts`，本组件只表现 + 回调）：
 * - `ready`（人在此地、尚未点亮）→ 给按钮。**这是机制成立的唯一入口**；
 * - `elsewhere`（有传送点但人不在）→ 只给说明，不给按钮 —— 否则可以隔空点亮，机制就废了；
 * - `done` → 换成「已点亮」标签 + 后果说明（可从任意地点传送至此）。
 *
 * 纯展示 + 回调：不读 store、不发请求、不改状态。
 */
import { Button, Flex, Tag, Typography } from 'antd';
import type { MapNodeView } from '@idle-path/ionet-transport';
import { SectionCard } from '@idle-path/ui-kit';
import { waypointInteractState } from './waypoint-gate.js';

export interface WaypointInteractCardProps {
  node: MapNodeView;
  currentCode: string | null;
  unlocked: ReadonlySet<string>;
  onInteract: (nodeCode: string) => void;
}

export function WaypointInteractCard(props: WaypointInteractCardProps) {
  const { node, currentCode, unlocked, onInteract } = props;
  const state = waypointInteractState(node, currentCode, unlocked);

  return (
    <div data-testid="map-lab-waypoint-card" data-state={state.kind}>
      <SectionCard title="传送点" subtitle={`${node.name} · 交互后解锁传送`}>
        <Flex vertical gap={8}>
          <Flex gap={8} align="center" wrap>
            {state.kind === 'done' ? (
              <Tag color="success" data-testid="map-lab-waypoint-done">
                已点亮
              </Tag>
            ) : (
              <Tag data-testid="map-lab-waypoint-pending">未点亮</Tag>
            )}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {state.hint}
            </Typography.Text>
          </Flex>
          {state.kind === 'ready' ? (
            <Button
              type="primary"
              block
              data-testid="map-lab-waypoint-interact"
              onClick={() => onInteract(node.code)}
            >
              与传送点交互
            </Button>
          ) : null}
        </Flex>
      </SectionCard>
    </div>
  );
}
