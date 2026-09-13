/**
 * CraftFurnace —— 炼器炉（从 `EconomyPanel` 拆出，保持单文件规模与单一职责）。
 *
 * 玩家动作链：**选物（`ItemPickerModal`）→ 选工艺（`CraftOpPicker`）→ 补定向参数 → 确认炼器**，
 * 结果是「更强的物品」或「物品被摧毁」，都由 `CraftResult` 呈现。
 *
 * 协议字段不上屏：`code/id` 只做 key / 请求值，`status` 原文不展示；不可用原因一律用中文说明。
 * 组件是受控的（store 数据与 `onCraft` 都由外部传入），不自己发请求。
 */
import { useState } from 'react';
import { Button, Flex, Select, Typography } from 'antd';
import type { CraftInput, CraftResultData, CurrencyView, EssenceView, ItemView } from '@idle-path/ionet-transport';
import {
  AffixList,
  ConfirmAction,
  CraftOpPicker,
  EmptyHint,
  ItemCard,
  ItemPickerModal,
  Toolbar,
  type ItemPickerFilters,
} from '@idle-path/ui-kit';
import { CraftResult } from './CraftResult.js';
import {
  buildCraftInput,
  craftBlockReason,
  craftOpOptions,
  extraParamOptions,
  type CraftContext,
} from './craft-rules.js';
import { DESTRUCTIVE_OPS, affixEntries, filterItems, opLabel, rarityOptions } from './presentation.js';

export interface CraftFurnaceProps {
  /** 背包物品（含已装备项，组件内只保留 `status='bag'`）。 */
  items: readonly ItemView[];
  currencies: readonly CurrencyView[];
  essences: readonly EssenceView[];
  lastCraft: CraftResultData | null;
  loading: boolean;
  onCraft: (input: CraftInput) => void;
}

export function CraftFurnace(props: CraftFurnaceProps) {
  const { items, currencies, essences, lastCraft, loading, onCraft } = props;
  const [picking, setPicking] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [op, setOp] = useState<string | undefined>(undefined);
  const [essenceCode, setEssenceCode] = useState<string | undefined>(undefined);
  const [targetCode, setTargetCode] = useState<string | undefined>(undefined);
  const [filters, setFilters] = useState<ItemPickerFilters>({});

  const bagItems = items.filter((entry) => entry.status === 'bag');
  const visibleItems = filterItems(bagItems, filters);
  const selected = bagItems.find((entry) => entry.id === selectedId) ?? null;
  const ctx: CraftContext = { item: selected, currencies, essences, essenceCode, targetCode };
  const blockReason = op === undefined ? '先选择一种炼器操作' : craftBlockReason(op, ctx);
  const canCraft = op !== undefined && blockReason === '';
  const extraOptions = extraParamOptions(op, selected, essences);
  const destructive = op !== undefined && DESTRUCTIVE_OPS.includes(op);

  /** 换 op 时清掉上一次的定向参数，避免把精华 code 误当基底词缀发给服务端。 */
  const chooseOp = (next: string): void => {
    setOp(next);
    setEssenceCode(undefined);
    setTargetCode(undefined);
  };

  return (
    <Flex vertical gap={12}>
      <Toolbar
        left={<Typography.Text type="secondary">{selected === null ? '尚未选择物品' : `已选：${selected.name}`}</Typography.Text>}
        right={
          <Button onClick={() => setPicking(true)} data-testid="economy-pick-item">
            选择物品
          </Button>
        }
      />

      <div data-testid="economy-selected">
        {selected === null ? (
          <EmptyHint compact description="从背包里选一件要炼的物品" />
        ) : (
          <ItemCard
            name={selected.name}
            tier={selected.tier}
            rarity={selected.rarity}
            footer={<AffixList affixes={affixEntries(selected.affixes)} compact />}
          />
        )}
      </div>

      <div data-testid="economy-ops">
        <CraftOpPicker ops={craftOpOptions(ctx)} value={op} onChange={chooseOp} />
      </div>

      {extraOptions === undefined ? null : (
        <div data-testid="economy-extra-param">
          <Select
            data-testid="economy-extra-select"
            placeholder={op === 'essence' ? '选择要使用的精华' : '选择要替换的基底词缀'}
            options={extraOptions}
            value={op === 'essence' ? essenceCode : targetCode}
            allowClear
            onChange={(next: string | undefined) => {
              if (op === 'essence') setEssenceCode(next);
              else setTargetCode(next);
            }}
          />
        </div>
      )}

      <Toolbar
        left={
          <Typography.Text type="secondary" data-testid="economy-block-reason">
            {blockReason === '' ? '炼器会消耗 1 枚对应通货，结果不可撤销' : blockReason}
          </Typography.Text>
        }
        right={
          <ConfirmAction
            title={`执行「${opLabel(op ?? '')}」？`}
            description="炼器会消耗通货且不可撤销；瓦尔宝珠有摧毁风险。"
            danger={destructive}
            disabled={!canCraft}
            onConfirm={() => {
              const input = buildCraftInput(selected?.id ?? null, op, essenceCode, targetCode);
              if (input !== null) onCraft(input);
            }}
          >
            <Button type="primary" disabled={!canCraft} loading={loading} data-testid="economy-craft">
              炼器
            </Button>
          </ConfirmAction>
        }
      />

      {lastCraft === null ? null : (
        <div data-testid="economy-last-craft">
          <CraftResult result={lastCraft} />
        </div>
      )}

      <ItemPickerModal
        open={picking}
        items={visibleItems}
        keyOf={(item) => String(item.id)}
        renderItem={(item) => <ItemCard name={item.name} tier={item.tier} rarity={item.rarity} />}
        filter={{ value: filters, onChange: setFilters, rarityOptions: rarityOptions() }}
        onPick={(item) => {
          setSelectedId(item.id);
          setPicking(false);
        }}
        onCancel={() => setPicking(false)}
        emptyText="背包里没有可炼的物品"
      />
    </Flex>
  );
}
