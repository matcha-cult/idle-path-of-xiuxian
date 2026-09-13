/**
 * SlotItemCard —— 单个已装备槽位的卡片（名称 / 阶 / 稀有度 + 卸下确认）。
 * 卸载是破坏性操作（物品回包），故用 `ConfirmAction` 二次确认。
 */
import { Button } from 'antd';
import type { EquippedSlotView } from '@idle-path/ionet-transport';
import { ConfirmAction, ItemCard } from '@idle-path/ui-kit';

export interface SlotItemCardProps {
  /** 槽位 key（只做 testid，不上屏）。 */
  slotKey: string;
  worn: EquippedSlotView;
  onUnequip: (itemId: number) => void;
}

export function SlotItemCard(props: SlotItemCardProps) {
  const { slotKey, worn, onUnequip } = props;
  return (
    <ItemCard
      name={worn.name}
      tier={worn.tier}
      rarity={worn.rarity}
      actions={
        <ConfirmAction
          title={`确认卸下「${worn.name}」？`}
          description="卸下后物品会回到背包。"
          danger
          onConfirm={() => onUnequip(worn.id)}
        >
          <Button data-testid={`equip-unequip-${slotKey}`}>卸下</Button>
        </ConfirmAction>
      }
    />
  );
}
