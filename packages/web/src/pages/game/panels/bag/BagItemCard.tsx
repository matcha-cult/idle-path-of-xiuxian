/**
 * BagItemCard —— 背包单件卡片（名称 / 阶 / 稀有度 / 词缀 + 装备・丢弃动作）。
 *
 * 纯展示 + 回调注入：不含任何 store 访问与业务判定（原因文案由 `./presentation.js` 计算）。
 * 禁用按钮不触发鼠标事件，故 Tooltip 必须包一层 `span` 才能显示不可用原因。
 */
import { Button, Space, Tag, Tooltip } from 'antd';
import type { ItemView } from '@idle-path/ionet-transport';
import { ConfirmAction, ItemCard } from '@idle-path/ui-kit';
import { discardBlockReason, equipBlockReason, statusLabel } from './presentation.js';

export interface BagItemCardProps {
  item: ItemView;
  /** 当前角色境界（可穿 `tier <= realm`）。 */
  realm: number;
  /** 是否为当前选中项（详情区数据源）。 */
  selected: boolean;
  onSelect: (itemId: number) => void;
  onEquip: (itemId: number) => void;
  onDiscard: (itemId: number) => void;
}

export function BagItemCard(props: BagItemCardProps) {
  const { item, realm, selected, onSelect, onEquip, onDiscard } = props;
  const equipReason = equipBlockReason(item, realm);
  const discardReason = discardBlockReason(item);

  return (
    <ItemCard
      name={item.name}
      tier={item.tier}
      rarity={item.rarity}
      affixTexts={item.affixTexts}
      selected={selected}
      onClick={() => onSelect(item.id)}
      footer={
        <Tag
          color={item.status === 'bag' ? 'blue' : 'success'}
          data-testid={`bag-status-${item.id}`}
        >
          {statusLabel(item.status)}
        </Tag>
      }
      actions={
        <Space wrap>
          <Tooltip title={equipReason === '' ? undefined : equipReason}>
            <span>
              <Button
                disabled={equipReason !== ''}
                onClick={() => onEquip(item.id)}
                data-testid={`bag-equip-${item.id}`}
              >
                装备
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={discardReason === '' ? undefined : discardReason}>
            <span>
              <ConfirmAction
                title={`丢弃「${item.name}」？`}
                description="丢弃会从背包中永久删除该物品，无法找回。"
                danger
                disabled={discardReason !== ''}
                onConfirm={() => onDiscard(item.id)}
              >
                <Button danger disabled={discardReason !== ''} data-testid={`bag-discard-${item.id}`}>
                  丢弃
                </Button>
              </ConfirmAction>
            </span>
          </Tooltip>
        </Space>
      }
    />
  );
}
