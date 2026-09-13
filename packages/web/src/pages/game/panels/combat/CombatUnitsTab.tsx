/**
 * CombatUnitsTab —— 单位图鉴页签（「现在什么情况」→「能做什么」）。
 *
 * 卡片网格回答「有哪些敌人、各自多强、打完给什么」；每张卡的 `spawn` / `kill`
 * 是 dev 工具（正式产出走秘境挑战与挂机结算），因此页签顶部统一标注「仅开发环境」。
 * 击杀数量由面板统一持有（受控），改一次即作用于该页签内所有单位的击杀按钮。
 */
import { Alert, Flex } from 'antd';
import { ResourceGrid } from '@idle-path/ui-kit';
import type { UnitCatalogView } from '@idle-path/ionet-transport';
import { formatCount } from '../../../../domain/format.js';
import { UnitCard } from './UnitCard.js';

export interface CombatUnitsTabProps {
  units: readonly UnitCatalogView[];
  total: number;
  /** 本次击杀数量（受控，1..50），对所有单位卡生效。 */
  killCount: number;
  loading?: boolean;
  onCountChange: (count: number) => void;
  onSpawn: (unit: UnitCatalogView) => void;
  onKill: (unit: UnitCatalogView, count: number) => void;
}

export function CombatUnitsTab(props: CombatUnitsTabProps) {
  const { units, total, killCount, loading, onCountChange, onSpawn, onKill } = props;

  return (
    <Flex vertical gap={12} data-testid="combat-units-tab">
      <Alert
        type="info"
        showIcon
        title="这里是敌人图鉴"
        description={`共 ${formatCount(total)} 种单位。正式产出请走秘境挑战与挂机结算；下方「生成实例 / 击杀」仅开发环境可用，生产环境会直接拒绝。`}
      />

      <ResourceGrid
        items={units}
        span={8}
        loading={loading}
        emptyText="暂无单位"
        keyOf={(unit) => unit.code}
        renderItem={(unit) => (
          <UnitCard
            unit={unit}
            count={killCount}
            onCountChange={onCountChange}
            loading={loading}
            onSpawn={onSpawn}
            onKill={onKill}
          />
        )}
      />
    </Flex>
  );
}
