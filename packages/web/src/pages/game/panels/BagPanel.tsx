/**
 * BagPanel —— 背包（器物线高频域）。**新版**：按 `10-玩法驱动的面板设计.md` §1.1 重做。
 *
 * 三段结构（问题驱动）：
 *   1. 现在什么情况？→ 工具条筛选（稀有度 / 品类 / T 阶区间）+ 本页件数 + 每张卡的「在背包 / 已装备」标签；
 *   2. 能做什么？→ 每件「装备」（`tier <= 境界` 才可用，否则悬浮说明原因）/「丢弃」（物理删除，二次确认）；
 *   3. 做完得到什么？→ 选中物品的「与当前槽位对比」`KeyValueList` + 完整词条 `AffixList`。
 *
 * 协议字段不上屏：`baseCode` / `status` 原文、`affixes[].affixId/key`、`pageSize` 一律不展示；
 * 物品 id 只做 key 与 testid。分页走受控 `PagedGrid`（切页 → `item.setPage`）。
 * 容器模式：不在挂载时拉取（首屏由 `loadPanel()` 并发加载）；三态交给 `AsyncBoundary`。
 */
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { Button, Flex, Select, Space, Typography } from 'antd';
import { MAX_REALM, RARITY_NAMES } from '@idle-path/ionet-transport';
import {
  AffixList,
  AsyncBoundary,
  KeyValueList,
  PagedGrid,
  QuantityInput,
  SectionCard,
  Toolbar,
  type KeyValueEntry,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { formatCompactNumber, formatCount } from '../../../domain/format.js';
import { BagItemCard } from './bag/BagItemCard.js';
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  equipBlockReason,
  filterBagItems,
  toAffixEntries,
  wornForSlot,
} from './bag/presentation.js';

/** 稀有度筛选项（文案取协议常量 `RARITY_NAMES`，不本地硬编码）。 */
const RARITY_OPTIONS = RARITY_NAMES.map((label, value) => ({ value, label }));

/** 装备 T 阶上限（与境界封顶同值，取自协议常量 `MAX_REALM`，不本地硬编码）。 */
const MAX_TIER = MAX_REALM;

export const BagPanel = observer(function BagPanel() {
  const { item, equip, prop, session } = useRootStore();
  const realm = session.character?.realm ?? 0;
  const [rarity, setRarity] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [tierMin, setTierMin] = useState<number | null>(null);
  const [tierMax, setTierMax] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const visible = filterBagItems(item.items, { rarity, category, tierMin, tierMax });
  const selected = item.items.find((entry) => entry.id === selectedId) ?? null;
  const worn = selected === null ? null : wornForSlot(selected.slot, equip.slots);
  const selectedReason = selected === null ? '' : equipBlockReason(selected, realm);

  const compareEntries: KeyValueEntry[] =
    selected === null
      ? []
      : [
          {
            key: 'category',
            label: '部位',
            value: selected.slot === null ? '不可穿戴' : categoryLabel(selected.category),
          },
          { key: 'self', label: '本件阶数', value: `T${formatCompactNumber(selected.tier)}` },
          { key: 'worn', label: '当前穿戴', value: worn === null ? '未装备' : worn.name },
          { key: 'wornTier', label: '槽位阶数', value: worn === null ? '—' : `T${formatCompactNumber(worn.tier)}` },
          {
            key: 'wearable',
            label: '可穿性',
            value: selectedReason === '' ? '可穿戴' : selectedReason,
            span: 2,
          },
        ];

  return (
    <Flex vertical gap={12}>
      <SectionCard
        title="背包"
        subtitle={`共 ${formatCount(item.total)} 件 · 第 ${formatCount(item.page)} 页`}
        extra={
          <Button onClick={() => void item.load()} data-testid="bag-refresh">
            刷新背包
          </Button>
        }
      >
        <AsyncBoundary
          loading={item.loading}
          error={item.error}
          empty={item.items.length === 0}
          emptyText="背包空空如也，先去秘境刷点掉落吧"
          onRetry={() => void item.load()}
        >
          <Flex vertical gap={12}>
            <Toolbar
              left={
                <Space wrap>
                  <span data-testid="bag-filter-rarity">
                    <Select
                      allowClear
                      placeholder="稀有度"
                      options={RARITY_OPTIONS}
                      value={rarity ?? undefined}
                      onChange={(value) => setRarity(value ?? null)}
                    />
                  </span>
                  <span data-testid="bag-filter-category">
                    <Select
                      allowClear
                      placeholder="品类"
                      options={[...CATEGORY_OPTIONS]}
                      value={category ?? undefined}
                      onChange={(value) => setCategory(value ?? null)}
                    />
                  </span>
                  <QuantityInput
                    value={tierMin ?? undefined}
                    min={1}
                    max={MAX_TIER}
                    placeholder="T 阶下限"
                    onChange={(value) => setTierMin(value)}
                  />
                  <QuantityInput
                    value={tierMax ?? undefined}
                    min={1}
                    max={MAX_TIER}
                    placeholder="T 阶上限"
                    onChange={(value) => setTierMax(value)}
                  />
                </Space>
              }
              right={
                <Typography.Text type="secondary" data-testid="bag-visible-count">
                  本页 {formatCount(visible.length)} / {formatCount(item.items.length)} 件
                </Typography.Text>
              }
            />

            <div data-testid="bag-list">
              <PagedGrid
                items={visible}
                span={8}
                keyOf={(entry) => String(entry.id)}
                emptyText="没有符合筛选条件的物品"
                page={item.page}
                pageSize={item.pageSize}
                total={item.total}
                onPageChange={(page) => item.setPage(page)}
                renderItem={(entry) => (
                  <BagItemCard
                    item={entry}
                    realm={realm}
                    selected={entry.id === selectedId}
                    onSelect={setSelectedId}
                    onEquip={(itemId) => void equip.equip(itemId)}
                    onDiscard={(itemId) => void prop.discard(itemId)}
                  />
                )}
              />
            </div>
          </Flex>
        </AsyncBoundary>
      </SectionCard>

      {selected === null ? null : (
        <SectionCard title={`物品详情 · ${selected.name}`} subtitle="与当前槽位对比，并查看完整词条">
          <Flex vertical gap={12}>
            <div data-testid="bag-compare">
              <KeyValueList column={{ xs: 1, sm: 2 }} items={compareEntries} />
            </div>
            <div data-testid="bag-affixes">
              <AffixList affixes={toAffixEntries(selected.affixes)} emptyText="该物品暂无词缀" />
            </div>
          </Flex>
        </SectionCard>
      )}
    </Flex>
  );
});
