/**
 * DropPoolTable —— 掉落池权重表（权重 → 概率，按类别小计）。
 *
 * 用途：把「权重表」摊成可读表格：每行权重与由权重推出的概率，并在提供 `kindOf` 时
 * 追加按类别的小计行（各类别的概率合计）。组件只做权重 → 概率的纯展示，
 * 不含任何掉落业务规则、不发请求。
 *
 * 约定：
 * - 用 antd `Table`（`pagination={false}`），概率用 `Typography.Text` 文本展示，
 *   **不逐行放 `Progress`**（一屏几十条进度条既吵又慢）；
 * - `loading` 原样透传；颜色只用预设语义色 / token。
 *
 * 边界：
 * - `weightOf` 返回非有限数（NaN / ±Infinity）或负数 → 该行权重按 `0` 处理；
 * - 总权重为 `0`（全 0 / 全非有限 / 负数相加得 0）→ 概率列统一显示 `—`，
 *   **不得**出现 `NaN` / `Infinity` / `-0.0%`；
 * - `entries=[]` → 走 antd `Empty`（`emptyText` 覆盖文案），summary 不渲染空小计行；
 * - 类别小计对「权重为 0」的类别照常显示 `0.0%`（玩家需要知道该类确实不会掉）。
 */
import { Empty, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';

export interface DropPoolTableProps<T> {
  entries: readonly T[];
  /** 取该条目的权重（非有限/负数按 0 处理）。 */
  weightOf: (entry: T) => number;
  /** 取该条目的类别（用于小计），缺省不分组。 */
  kindOf?: (entry: T) => string;
  /** 取该条目的展示名。 */
  labelOf: (entry: T) => ReactNode;
  /** 类别 → 中文名（缺省原样显示 code）。 */
  kindLabelOf?: (kind: string) => ReactNode;
  /** 取行 key，缺省用索引。 */
  keyOf?: (entry: T, index: number) => string;
  /** 是否显示概率列，缺省 true。 */
  showProbability?: boolean;
  /** 空文案。 */
  emptyText?: ReactNode;
  loading?: boolean;
}

/** 概率占位符：总权重为 0 时使用。 */
const PROBABILITY_PLACEHOLDER = '—';

/** 权重归一：非有限数与负数一律折成 0，保证后续求和不会污染成 NaN。 */
function normalizeWeight(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** 概率文案：保留 1 位小数的百分比；总权重 ≤0 时给 `—`。 */
function probabilityText(weight: number, total: number): string {
  if (total <= 0) return PROBABILITY_PLACEHOLDER;
  return `${((weight / total) * 100).toFixed(1)}%`;
}

/** 一行表格数据：原条目 + 已归一化的权重 + 行 key。 */
interface Row<T> {
  entry: T;
  weight: number;
  rowKey: string;
}

export function DropPoolTable<T>(props: DropPoolTableProps<T>) {
  const {
    entries,
    weightOf,
    kindOf,
    labelOf,
    kindLabelOf,
    keyOf,
    showProbability = true,
    emptyText,
    loading,
  } = props;

  const rows: Row<T>[] = entries.map((entry, index) => ({
    entry,
    weight: normalizeWeight(weightOf(entry)),
    rowKey: keyOf ? keyOf(entry, index) : String(index),
  }));
  const total = rows.reduce((sum, row) => sum + row.weight, 0);

  const columns: ColumnsType<Row<T>> = [
    {
      key: 'label',
      title: '名称',
      render: (_value, row) => <span data-testid={`drop-pool-label-${row.rowKey}`}>{labelOf(row.entry)}</span>,
    },
  ];

  if (kindOf) {
    columns.push({
      key: 'kind',
      title: '类别',
      render: (_value, row) => (
        <span data-testid={`drop-pool-kind-${row.rowKey}`}>
          {kindLabelOf ? kindLabelOf(kindOf(row.entry)) : kindOf(row.entry)}
        </span>
      ),
    });
  }

  columns.push({
    key: 'weight',
    title: '权重',
    render: (_value, row) => <span data-testid={`drop-pool-weight-${row.rowKey}`}>{row.weight}</span>,
  });

  if (showProbability) {
    columns.push({
      key: 'probability',
      title: '概率',
      render: (_value, row) => (
        <Typography.Text data-testid={`drop-pool-probability-${row.rowKey}`}>
          {probabilityText(row.weight, total)}
        </Typography.Text>
      ),
    });
  }

  /** 按类别聚合小计（只在 `kindOf` 存在时有意义）；保持首次出现顺序。 */
  const kindTotals: Array<{ kind: string; weight: number }> = [];
  if (kindOf) {
    for (const row of rows) {
      const kind = kindOf(row.entry);
      const found = kindTotals.find((item) => item.kind === kind);
      if (found) found.weight += row.weight;
      else kindTotals.push({ kind, weight: row.weight });
    }
  }

  const span = columns.length;
  const hasSubtotal = kindTotals.length > 0;

  /** 小计行：类别名 +（类别列时）权重合计 + 概率合计（总权重 ≤0 时概率为 `—`）。 */
  const renderSummary = () => (
    <Table.Summary data-testid="drop-pool-table-summary">
      {kindTotals.map((item) => (
        <Table.Summary.Row key={item.kind} data-testid={`drop-pool-subtotal-${item.kind}`}>
          <Table.Summary.Cell index={0}>
            {kindLabelOf ? kindLabelOf(item.kind) : item.kind} 合计
          </Table.Summary.Cell>
          {span > 2 ? (
            <Table.Summary.Cell index={1} data-testid={`drop-pool-subtotal-weight-${item.kind}`}>
              {item.weight}
            </Table.Summary.Cell>
          ) : null}
          <Table.Summary.Cell index={span - 1}>
            <Typography.Text strong data-testid={`drop-pool-subtotal-probability-${item.kind}`}>
              {probabilityText(item.weight, total)}
            </Typography.Text>
          </Table.Summary.Cell>
        </Table.Summary.Row>
      ))}
    </Table.Summary>
  );

  return (
    <Table<Row<T>>
      data-testid="drop-pool-table-root"
      rowKey="rowKey"
      columns={columns}
      dataSource={rows}
      pagination={false}
      loading={loading}
      locale={{
        emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />,
      }}
      summary={hasSubtotal ? renderSummary : undefined}
    />
  );
}
