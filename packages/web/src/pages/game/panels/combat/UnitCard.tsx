/**
 * UnitCard —— 单个敌人的图鉴卡（从 CombatPanel 拆出，保持单文件规模）。
 *
 * 回答问题「这是什么敌人、打不打得过、打完给什么」：
 *   名号 / 阵营 / 境界 → 四维 `StatGrid` → 灵韵与掉落表 → `spawn` / `kill`（dev）。
 *
 * 协议字段不上屏：`id` / `code` 只做 key 与 testid，`hiddenPool`（隐藏词条 code）
 * 与隐藏词条效果**一律不展示**（`10-...md` §1.8 明确要求）。
 * 击杀是破坏性操作：`ConfirmAction` 二次确认；只有 `hostile` 可杀。
 */
import { Button, Card, Flex, Space, Tag, Typography } from 'antd';
import { ConfirmAction, QuantityInput, StatGrid } from '@idle-path/ui-kit';
import type { UnitCatalogView } from '@idle-path/ionet-transport';
import { formatCompactNumber } from '../../../../domain/format.js';
import { campLabel, isKillable, unitStatEntries } from './presentation.js';

/** 击杀数量区间（协议 `KillUnitInput.count` 为 1..50）。 */
export const KILL_COUNT_MIN = 1;
export const KILL_COUNT_MAX = 50;

export interface UnitCardProps {
  unit: UnitCatalogView;
  /** 本次要击杀的数量（受控，1..50）。 */
  count: number;
  /** 击杀数量变化。 */
  onCountChange: (count: number) => void;
  loading?: boolean;
  onSpawn: (unit: UnitCatalogView) => void;
  onKill: (unit: UnitCatalogView, count: number) => void;
}

export function UnitCard(props: UnitCardProps) {
  const { unit, count, onCountChange, loading, onSpawn, onKill } = props;
  const killable = isKillable(unit);

  return (
    <Card
      variant="outlined"
      data-testid={`combat-unit-${unit.code}`}
      title={
        <Space wrap>
          <span>{unit.name}</span>
          {killable ? <Tag color="error">敌对</Tag> : <Tag>{campLabel(unit.camp)}</Tag>}
        </Space>
      }
    >
      <Flex vertical gap={8}>
        <Typography.Text type="secondary">
          {unit.realmName} · 第 {formatCompactNumber(unit.realm)} 境
        </Typography.Text>

        <div data-testid={`combat-unit-stats-${unit.code}`}>
          <StatGrid
            column={2}
            items={unitStatEntries(unit.baseStats).map((entry) => ({
              key: entry.key,
              label: entry.label,
              value: formatCompactNumber(entry.value),
            }))}
          />
        </div>

        <Typography.Text type="secondary">
          击杀奖励：灵韵 {formatCompactNumber(unit.lingyunReward)}
          {unit.givesLingyun ? '' : '（不掉灵韵）'}
        </Typography.Text>

        <Flex align="center" gap={8} wrap>
          <Typography.Text type="secondary">数量</Typography.Text>
          <QuantityInput
            value={count}
            min={KILL_COUNT_MIN}
            max={KILL_COUNT_MAX}
            onChange={(next) => onCountChange(next ?? KILL_COUNT_MIN)}
          />
        </Flex>

        <Space wrap>
          <Button
            onClick={() => onSpawn(unit)}
            disabled={loading}
            data-testid={`combat-spawn-${unit.code}`}
          >
            生成实例
          </Button>
          <ConfirmAction
            title={`击杀「${unit.name}」×${count}？`}
            description="立即结算灵韵与掉落，该操作不可撤销。"
            okText="确认击杀"
            danger
            disabled={!killable || loading}
            onConfirm={() => onKill(unit, count)}
          >
            <Button danger disabled={!killable || loading} data-testid={`combat-kill-${unit.code}`}>
              {killable ? '击杀' : '不可击杀'}
            </Button>
          </ConfirmAction>
        </Space>
      </Flex>
    </Card>
  );
}
