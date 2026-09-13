/**
 * CraftOpPicker —— 炼器操作选择（消耗与可用性同屏）。
 *
 * 用途：把「可对当前物品执行的炼器操作」铺成一眼看全的选项组，每项同时给出名称、
 * 消耗的通货与不可用原因。**刻意不用 `Select`**：操作数少、且消耗与禁用原因必须
 * 在面上可见，下拉会把它们藏起来。
 *
 * 约定：
 * - 用 antd `Radio.Group`（`optionType="button"`）承载选中态，选项为受控 `value` + `onChange`；
 * - `available=false` 的项禁用，并把 `disabledReason` 包在 `Tooltip` 里；被禁用的
 *   `Radio.Button` 不触发鼠标事件，故 `Tooltip` 的触发器必须包一层可接收事件的 `span`；
 * - 颜色只用 antd token（`Typography.Text type="secondary"`），不写 hex，不传 `size`。
 *
 * 边界：
 * - `ops=[]` → 渲染 `emptyText`（缺省「暂无可执行的操作」）；
 * - 全部 `available=false` → **照常渲染全部选项**（玩家需要看到「为什么都不能点」），
 *   不降级成空态；
 * - `value` 不在 `ops` 内（含 `undefined`）→ 一项都不选中，不抛错、不出现 NaN；
 * - `costLabel` 缺省时只显示名称，不留空占位。
 */
import { Flex, Radio, Tooltip, Typography } from 'antd';
import type { ReactNode } from 'react';

export interface CraftOpOption {
  /** 操作标识（后端 CRAFT_OPS 的取值，如 'chaos' / 'exalt'）。 */
  op: string;
  /** 中文名。 */
  label: ReactNode;
  /** 消耗的通货 name（用于展示）。 */
  costLabel?: ReactNode;
  /** 是否可用（余额足够且该 op 对当前物品可行）。 */
  available: boolean;
  /** 不可用原因（悬浮提示）。 */
  disabledReason?: ReactNode;
}

export interface CraftOpPickerProps {
  ops: readonly CraftOpOption[];
  /** 受控选中项。 */
  value?: string;
  onChange: (op: string) => void;
  /** 布局，缺省 'grid'。 */
  layout?: 'grid' | 'list';
  /** 无可用操作时的文案。 */
  emptyText?: ReactNode;
}

/** 空态缺省文案。 */
const DEFAULT_EMPTY_TEXT = '暂无可执行的操作';

/**
 * 仅当 `value` 确实是 `ops` 内的某个 `op` 时才交给 `Radio.Group`；
 * 否则返回 `undefined`（不选中任何项），避免 antd 收到悬空值后仍高亮旧选项。
 */
function resolveSelected(ops: readonly CraftOpOption[], value?: string): string | undefined {
  if (value === undefined) return undefined;
  return ops.some((option) => option.op === value) ? value : undefined;
}

export function CraftOpPicker(props: CraftOpPickerProps) {
  const { ops, value, onChange, layout = 'grid', emptyText } = props;

  if (ops.length === 0) {
    return (
      <Flex data-testid="craft-op-picker-root">
        <Typography.Text type="secondary" data-testid="craft-op-picker-empty">
          {emptyText ?? DEFAULT_EMPTY_TEXT}
        </Typography.Text>
      </Flex>
    );
  }

  return (
    <Flex data-testid="craft-op-picker-root">
      <Radio.Group
        data-testid="craft-op-picker-group"
        value={resolveSelected(ops, value)}
        optionType="button"
        block
        orientation={layout === 'list' ? 'vertical' : 'horizontal'}
        onChange={(event) => onChange(String(event.target.value))}
      >
        {ops.map((option) => {
          const button = (
            <Radio.Button
              key={option.op}
              value={option.op}
              disabled={!option.available}
              data-testid={`craft-op-picker-item-${option.op}`}
            >
              <Flex
                vertical={layout === 'list'}
                gap={4}
                align="center"
                data-testid={`craft-op-picker-body-${option.op}`}
              >
                <span data-testid={`craft-op-picker-label-${option.op}`}>{option.label}</span>
                {option.costLabel === undefined || option.costLabel === null ? null : (
                  <Typography.Text type="secondary" data-testid={`craft-op-picker-cost-${option.op}`}>
                    {option.costLabel}
                  </Typography.Text>
                )}
              </Flex>
            </Radio.Button>
          );

          if (option.available) return button;

          return (
            <Tooltip key={option.op} title={option.disabledReason}>
              {/* 禁用按钮不触发鼠标事件，必须由外层 span 承接 hover。 */}
              <span data-testid={`craft-op-picker-tip-${option.op}`}>{button}</span>
            </Tooltip>
          );
        })}
      </Radio.Group>
    </Flex>
  );
}
