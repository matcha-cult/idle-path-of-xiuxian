/**
 * CombatDropsTab —— 掉落表页签（纯查表：某张掉落表会掉什么、各占多少概率）。
 *
 * 用语义色 `Select` 选表 + `DropPoolTable` 把权重归一化成概率（**面板不算概率**，
 * 组件内部完成）。协议字段不上屏：`code` / `id` 只做 key，`weight` 由组件换算成百分比，
 * 通货 / 精华展示中文名（`nameOf` 由容器用 economy 域的映射注入）。
 */
import { Flex, Select, Space, Tag, Typography } from 'antd';
import { DropPoolTable, EmptyHint } from '@idle-path/ui-kit';
import type { DropEntryView, DropTableView } from '@idle-path/ionet-transport';
import { formatCompactNumber } from '../../../../domain/format.js';
import { countText, dropEntryLabel, dropKindLabel } from './presentation.js';

export interface CombatDropsTabProps {
  tables: readonly DropTableView[];
  /** 当前选中的掉落表 code；缺省取第一张。 */
  selectedCode: string | null;
  onSelect: (code: string) => void;
  /** 通货 / 精华 code → 中文名（缺映射时给占位文案，绝不回显 code）。 */
  nameOf: (code: string) => string | undefined;
  loading?: boolean;
}

/** 选中项兜底：未选或选中的表已消失时退回第一张。 */
function resolveTable(
  tables: readonly DropTableView[],
  selectedCode: string | null,
): DropTableView | undefined {
  return tables.find((table) => table.code === selectedCode) ?? tables[0];
}

export function CombatDropsTab(props: CombatDropsTabProps) {
  const { tables, selectedCode, onSelect, nameOf, loading } = props;
  const table = resolveTable(tables, selectedCode);

  if (table === undefined) {
    return (
      <div data-testid="combat-drops-empty">
        <EmptyHint description="暂无掉落表" />
      </div>
    );
  }

  return (
    <Flex vertical gap={12} data-testid="combat-drops-tab">
      <Space wrap align="center">
        <Typography.Text type="secondary">掉落表</Typography.Text>
        <Select
          value={table.code}
          onChange={onSelect}
          style={{ minWidth: 180 }}
          data-testid="combat-drop-table-select"
          options={tables.map((entry) => ({ value: entry.code, label: entry.name }))}
        />
        <Tag>每杀掉落 {formatCompactNumber(table.dropsPerKill)} 次</Tag>
        <Tag>档位偏移 {formatCompactNumber(table.tierOffset)}</Tag>
      </Space>

      <div data-testid={`combat-drop-table-${table.code}`}>
        <DropPoolTable<DropEntryView>
          entries={table.entries}
          loading={loading}
          emptyText="该掉落表暂无条目"
          showWeight={false}
          keyOf={(_entry, index) => String(index)}
          weightOf={(entry) => entry.weight}
          kindOf={(entry) => entry.kind}
          kindLabelOf={dropKindLabel}
          labelOf={(entry) => (
            <Space size={4} wrap>
              <span>{dropEntryLabel(entry, nameOf)}</span>
              <Typography.Text type="secondary">×{countText(entry)}</Typography.Text>
            </Space>
          )}
        />
      </div>
    </Flex>
  );
}
