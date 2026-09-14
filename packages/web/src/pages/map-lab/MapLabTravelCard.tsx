/**
 * `MapLabTravelCard` —— 「前往 / 传送」的动作面。
 *
 * 契约（`14-...md` §12.1，**不能破**）：画布上点击枢纽**只选中**，移动只在这里发生 ——
 * 唯一的规范路径就是这个按钮（PC 另有双击快捷键，由容器解析 `source='double'`）。
 * 理由：「有代价的动作，必须由明确的意图触发」，一条规则同时解决 PC 误点与移动端误触。
 *
 * 按钮文案由 `travelDecision` 决定，`blocked` 时**不给可点的按钮**并说明原因
 * —— 这既防误触，也顺手把机制教给玩家（与底部 `MapHintBar` 常驻提示同一目的）。
 *
 * 纯展示 + 回调：不读 store、不发请求。
 */
import { Button, Flex, Typography } from 'antd';
import type { MapNodeView } from '@idle-path/ionet-transport';
import { SectionCard } from '@idle-path/ui-kit';
import type { TravelDecision, TravelKind } from './waypoint-gate.js';

export interface MapLabTravelCardProps {
  node: MapNodeView;
  decision: TravelDecision;
  /** 「前往 / 传送」请求进行中（**按钮级** loading；面板内容不卸载）。 */
  moving: boolean;
  /** 正在移动的目标节点 code；按钮 loading 只给它，其余按钮只禁用。 */
  movingTo: string | null;
  onTravel: (nodeCode: string, kind: TravelKind) => void;
}

const ACTION_LABELS: Record<TravelKind, string> = {
  here: '已在原地',
  walk: '前往此地',
  teleport: '传送至此',
  blocked: '暂不可前往',
};

export function MapLabTravelCard(props: MapLabTravelCardProps) {
  const { node, decision, moving, movingTo, onTravel } = props;
  const busy = moving && movingTo === node.code;
  const disabled = decision.kind === 'here' || decision.kind === 'blocked' || (moving && !busy);

  return (
    <div data-testid="map-lab-travel-card" data-kind={decision.kind}>
      <SectionCard title="移动" subtitle={`目标：${node.name}`}>
        <Flex vertical gap={8}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {decision.hint}
          </Typography.Text>
          <Button
            type={decision.kind === 'walk' ? 'primary' : 'default'}
            block
            disabled={disabled}
            loading={busy}
            data-testid="map-lab-travel-action"
            onClick={() => onTravel(node.code, decision.kind)}
          >
            {ACTION_LABELS[decision.kind]}
          </Button>
        </Flex>
      </SectionCard>
    </div>
  );
}
