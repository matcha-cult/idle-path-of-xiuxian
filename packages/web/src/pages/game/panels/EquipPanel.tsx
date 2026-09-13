/**
 * EquipPanel —— 装备（修行线）。**新版**：按 `10-玩法驱动的面板设计.md` §1.2 重做。
 *
 * 三段结构（问题驱动）：
 *   1. 现在什么情况？→ `StatGrid`（已装备 / 当前境界 / 可穿装备阶 / 空槽）+ `SlotBoard` 十处槽位；
 *   2. 能做什么？→ 点槽位看该部位候选（背包同部位 + 未装备），可穿的直接换装、不可穿的 `LockedHint` 说明门槛；
 *   3. 做完得到什么？→ 「详情」拉 `item.detail` 并用 `AffixList` 展示完整词条；卸下用 `ConfirmAction`。
 *
 * 协议字段不上屏：槽位 key / 物品 id 只做 key 与 testid，`slots` 的空值以「未装备」表达。
 * 战力等公式不在面板侧计算（本域不展示战力，避免自造规则）。
 * 容器模式：不在挂载时拉取（首屏由 `loadPanel()` 并发加载）；三态交给 `AsyncBoundary`。
 */
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { Button, Flex, Typography } from 'antd';
import {
  AffixList,
  AsyncBoundary,
  EmptyHint,
  ResourceGrid,
  SectionCard,
  SlotBoard,
  StatGrid,
  type SlotBoardItem,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { formatCompactNumber, formatCount } from '../../../domain/format.js';
import { toAffixEntries } from './bag/presentation.js';
import { CandidateCard } from './equip/CandidateCard.js';
import { SlotItemCard } from './equip/SlotItemCard.js';
import { SLOT_KEYS, candidatesForSlot, realmLabel, slotLabel } from './equip/presentation.js';

export const EquipPanel = observer(function EquipPanel() {
  const { equip, item, session } = useRootStore();
  const realm = session.character?.realm ?? 0;
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  // 空态判定：服务端尚未返回任何槽位键（默认 `{}`）。十个值为 null 的槽位仍要逐个展示。
  const hasSlots = Object.keys(equip.slots).length > 0;

  const slots: SlotBoardItem[] = SLOT_KEYS.map((slotKey) => {
    const worn = equip.slots[slotKey] ?? null;
    return {
      key: slotKey,
      label: slotLabel(slotKey),
      item:
        worn === null ? undefined : (
          <SlotItemCard slotKey={slotKey} worn={worn} onUnequip={(itemId) => void equip.unequip(itemId)} />
        ),
      empty: <EmptyHint compact description="未装备" />,
      onClick: () => setSelectedSlot(slotKey),
    };
  });

  const candidates = selectedSlot === null ? [] : candidatesForSlot(item.items, selectedSlot);
  const detail = item.detail;

  return (
    <Flex vertical gap={12}>
      <SectionCard
        title="装备"
        subtitle="十处槽位一眼看清；点击槽位可查看该部位在背包里的候选"
        extra={
          <Button onClick={() => void equip.load()} data-testid="equip-refresh">
            刷新装备栏
          </Button>
        }
      >
        <AsyncBoundary
          loading={equip.loading}
          error={equip.error}
          empty={!hasSlots}
          emptyText="装备栏暂无数据"
          onRetry={() => void equip.load()}
        >
          <Flex vertical gap={12}>
            <div data-testid="equip-stats">
              <StatGrid
                items={[
                  {
                    key: 'equipped',
                    label: '已装备',
                    value: `${formatCount(equip.equippedCount)} / ${formatCount(SLOT_KEYS.length)}`,
                  },
                  { key: 'realm', label: '当前境界', value: realmLabel(realm) },
                  { key: 'tier', label: '可穿装备阶', value: `T${formatCompactNumber(realm)}` },
                  {
                    key: 'empty',
                    label: '空槽位',
                    value: formatCount(Math.max(0, SLOT_KEYS.length - equip.equippedCount)),
                  },
                ]}
              />
            </div>
            <div data-testid="equip-board">
              <SlotBoard slots={slots} tone="equip" columns={{ xs: 2, sm: 3, md: 4, lg: 5 }} />
            </div>
          </Flex>
        </AsyncBoundary>
      </SectionCard>

      {selectedSlot === null ? null : (
        <SectionCard
          title={`候选装备 · ${slotLabel(selectedSlot)}`}
          subtitle="背包中同部位、尚未装备的物件"
          extra={
            <Button onClick={() => setSelectedSlot(null)} data-testid="equip-clear-slot">
              取消选择
            </Button>
          }
        >
          <AsyncBoundary
            loading={item.loading}
            error={item.error}
            empty={candidates.length === 0}
            emptyText="背包里没有该部位可换的装备"
            onRetry={() => void item.load()}
          >
            <div data-testid="equip-candidates">
              <ResourceGrid
                items={candidates}
                span={8}
                keyOf={(entry) => String(entry.id)}
                renderItem={(entry) => (
                  <CandidateCard
                    candidate={entry}
                    realm={realm}
                    onEquip={(itemId) => void equip.equip(itemId)}
                    onInspect={(itemId) => void item.loadDetail(itemId)}
                  />
                )}
              />
            </div>
          </AsyncBoundary>
        </SectionCard>
      )}

      {detail === null ? null : (
        <SectionCard title={`物品详情 · ${detail.name}`} subtitle="完整词条（含 T 阶与天定铭文）">
          <Flex vertical gap={12}>
            <div data-testid="equip-detail">
              <AffixList affixes={toAffixEntries(detail.affixes)} emptyText="该物品暂无词缀" />
            </div>
            <Typography.Text type="secondary">
              提示：在背包面板可对同部位物品直接换装或丢弃
            </Typography.Text>
          </Flex>
        </SectionCard>
      )}
    </Flex>
  );
});
