/**
 * EquipPanel —— 装备栏（equip 段）。
 *
 * 容器模式（与 `BagPanel` 一致）：只做「store 状态 → ui-kit 组件 props」映射，不写业务规则；
 * **不在挂载时自动拉取**（首屏由 `RootStore.loadPanel()` 并发加载）；三态交给 `AsyncBoundary`。
 * 卸下是破坏性操作，用 `ConfirmAction` 二次确认。
 */
import { observer } from 'mobx-react-lite';
import { Button, Flex } from 'antd';
import { EQUIP_SLOT_KEYS } from '@idle-path/ionet-transport';
import {
  AsyncBoundary,
  ConfirmAction,
  ItemCard,
  ResourceGrid,
  SectionCard,
  Toolbar,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';

export const EquipPanel = observer(function EquipPanel() {
  const root = useRootStore();
  const { equip } = root;
  // 空态判定：服务端尚未返回任何槽位键（默认 `{}`）。十个值为 null 的槽位仍要逐个展示。
  const hasSlots = Object.keys(equip.slots).length > 0;

  return (
    <SectionCard
      title="装备栏"
      extra={
        <Button onClick={() => void equip.load()} data-testid="equip-refresh">
          刷新装备栏
        </Button>
      }
    >
      <Toolbar
        right={<span data-testid="equip-equipped-count">已装备 {equip.equippedCount} 件</span>}
      />

      <AsyncBoundary
        loading={equip.loading}
        error={equip.error}
        empty={!hasSlots}
        emptyText="装备栏暂无数据"
        onRetry={() => void equip.load()}
      >
        <ResourceGrid
          items={EQUIP_SLOT_KEYS}
          span={8}
          keyOf={(slot) => slot}
          renderItem={(slot) => {
            const worn = equip.slots[slot] ?? null;
            return (
              <Flex vertical data-testid={`equip-slot-${slot}`}>
                <ItemCard
                  name={worn === null ? '空' : worn.name}
                  tier={worn?.tier}
                  rarity={worn?.rarity}
                  meta={slot}
                  actions={
                    worn === null ? undefined : (
                      <ConfirmAction
                        title={`确认卸下「${worn.name}」？`}
                        description="卸下后物品会回到背包。"
                        danger
                        onConfirm={() => equip.unequip(worn.id)}
                      >
                        <Button data-testid={`equip-unequip-${slot}`}>卸下</Button>
                      </ConfirmAction>
                    )
                  }
                />
              </Flex>
            );
          }}
        />
      </AsyncBoundary>
    </SectionCard>
  );
});
