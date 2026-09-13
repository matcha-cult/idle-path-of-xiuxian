/**
 * CandidateCard —— 某槽位的一件候选装备。
 *
 * 可穿（`tier <= 境界`）→ `ItemCard` + 装备 / 详情；
 * 不可穿 → `LockedHint`（说明还差多少），**不提供装备入口**（阶数 vs 境界的门槛校验）。
 */
import { Button, Space } from 'antd';
import type { ItemView } from '@idle-path/ionet-transport';
import { ItemCard, LockedHint } from '@idle-path/ui-kit';
import { tierGateReason } from './presentation.js';

export interface CandidateCardProps {
  candidate: ItemView;
  /** 当前角色境界（可穿 `tier <= realm`）。 */
  realm: number;
  onEquip: (itemId: number) => void;
  onInspect: (itemId: number) => void;
}

export function CandidateCard(props: CandidateCardProps) {
  const { candidate, realm, onEquip, onInspect } = props;
  const reason = tierGateReason(candidate.tier, realm);

  if (reason !== '') {
    return (
      <div data-testid={`equip-candidate-${candidate.id}`}>
        <LockedHint
          title={`${candidate.name}（T${candidate.tier}）暂不可穿`}
          reason="realm"
          required={candidate.tier}
          current={realm}
          hint={reason}
        />
      </div>
    );
  }

  return (
    <div data-testid={`equip-candidate-${candidate.id}`}>
      <ItemCard
        name={candidate.name}
        tier={candidate.tier}
        rarity={candidate.rarity}
        affixTexts={candidate.affixTexts}
        actions={
          <Space wrap>
            <Button
              type="primary"
              onClick={() => onEquip(candidate.id)}
              data-testid={`equip-candidate-equip-${candidate.id}`}
            >
              装备
            </Button>
            <Button
              onClick={() => onInspect(candidate.id)}
              data-testid={`equip-candidate-detail-${candidate.id}`}
            >
              详情
            </Button>
          </Space>
        }
      />
    </div>
  );
}
