/**
 * EconomyPanel —— 通货 / 精华 / 炼器（economy 段）。
 *
 * 容器模式：两张 `DataTable` 展示持有量，`ActionForm` 驱动炼器，`lastCraft` 用 `KeyValueList`
 * 展示（含瓦尔摧毁分支）；开发注入改动持有量，用 `ConfirmAction` 包裹。三态交给 `AsyncBoundary`。
 * ⚠️ **旧版（M3 交付，已判定不合格）**：仅保留其测试以覆盖 store 契约；
 * 新版按「玩法驱动」重做后删除本文件（见 ai-docs/frontend-solution-exploration/10-玩法驱动的面板设计.md）。
 */
import { observer } from 'mobx-react-lite';
import { Button, Flex, Input, Space } from 'antd';
import { useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { CRAFT_OPS } from '@idle-path/ionet-transport';
import type { CraftResultData, CurrencyView, EssenceView } from '@idle-path/ionet-transport';
import { ActionForm, AsyncBoundary, ConfirmAction, DataTable, KeyValueList, QuantityInput, SectionCard, Toolbar } from '@idle-path/ui-kit';
import type { ActionField, KeyValueEntry } from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';

/** 通货 / 精华两表列定义逐字相同，抽成一个纯展示工厂。 */
function ownedColumns<T>(): ColumnsType<T> {
  return [
    { title: 'code', dataIndex: 'code', key: 'code' },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '持有量', dataIndex: 'owned', key: 'owned' },
  ];
}
const CURRENCY_COLUMNS = ownedColumns<CurrencyView>();
const ESSENCE_COLUMNS = ownedColumns<EssenceView>();

/** 炼器表单：`op` 取值域来自 transport 的 `CRAFT_OPS`（不在面板里另写字面量）。 */
const CRAFT_FIELDS: readonly ActionField[] = [
  { kind: 'number', name: 'itemId', label: '物品 id', min: 1, required: true },
  {
    kind: 'select', name: 'op', label: '炼器操作', required: true, placeholder: '选择炼器操作',
    options: CRAFT_OPS.map((op) => ({ label: op, value: op })),
  },
];

/** 炼器结果 → 只读键值明细（纯展示映射，不参与任何公式）。 */
function craftEntries(result: CraftResultData): KeyValueEntry[] {
  if ('destroyed' in result) {
    return [
      { key: 'result', label: '炼器结果', value: '物品已摧毁' },
      { key: 'itemId', label: '物品 id', value: result.itemId },
    ];
  }
  return [
    { key: 'item', label: '物品', value: result.item.name },
    { key: 'itemId', label: '物品 id', value: result.item.id },
    ...(result.outcome === undefined ? [] : [{ key: 'outcome', label: '炼器结果', value: result.outcome }]),
  ];
}

export const EconomyPanel = observer(function EconomyPanel() {
  const root = useRootStore();
  const { economy } = root;
  const [code, setCode] = useState('');
  const [count, setCount] = useState<number | null>(1);
  const injectable = code.trim() !== '' && count !== null;
  const empty = economy.currencies.length === 0 && economy.essences.length === 0;

  return (
    <SectionCard
      title="通货与精华"
      extra={
        <Button onClick={() => void economy.load()} data-testid="economy-refresh">
          刷新经济面板
        </Button>
      }
    >
      <AsyncBoundary
        loading={economy.loading}
        error={economy.error}
        empty={empty}
        emptyText="暂无通货与精华数据"
        onRetry={() => void economy.load()}
      >
        <Flex vertical gap={12}>
          <Flex data-testid="economy-currencies">
            <DataTable<CurrencyView> columns={CURRENCY_COLUMNS} dataSource={economy.currencies} rowKey="id" title="通货" emptyText="暂无通货" />
          </Flex>
          <Flex data-testid="economy-essences">
            <DataTable<EssenceView> columns={ESSENCE_COLUMNS} dataSource={economy.essences} rowKey="id" title="精华" emptyText="暂无精华" />
          </Flex>
          <Flex data-testid="economy-craft">
            <ActionForm
              fields={CRAFT_FIELDS}
              submitText="炼器"
              loading={economy.loading}
              onFinish={(values) => economy.craft({ itemId: Number(values.itemId), op: String(values.op) })}
            />
          </Flex>
          {economy.lastCraft === null ? null : (
            <Flex data-testid="economy-last-craft">
              <KeyValueList title="最近炼器结果" column={2} bordered items={craftEntries(economy.lastCraft)} />
            </Flex>
          )}
          <Toolbar
            left={<span>开发注入</span>}
            right={
              <Space>
                <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="通货 / 精华 code" data-testid="economy-inject-code" />
                <QuantityInput value={count ?? undefined} onChange={setCount} min={1} max={9999} />
                <ConfirmAction
                  title={`确认注入通货 ${code}？`}
                  description="开发注入会直接改动持有量。"
                  disabled={!injectable}
                  onConfirm={() => economy.grantCurrency({ code: code.trim(), count: count ?? 0 })}
                >
                  <Button disabled={!injectable} data-testid="economy-grant-currency">注入通货</Button>
                </ConfirmAction>
                <ConfirmAction
                  title={`确认注入精华 ${code}？`}
                  description="开发注入会直接改动持有量。"
                  disabled={!injectable}
                  onConfirm={() => economy.grantEssence({ code: code.trim(), count: count ?? 0 })}
                >
                  <Button disabled={!injectable} data-testid="economy-grant-essence">注入精华</Button>
                </ConfirmAction>
              </Space>
            }
          />
        </Flex>
      </AsyncBoundary>
    </SectionCard>
  );
});
