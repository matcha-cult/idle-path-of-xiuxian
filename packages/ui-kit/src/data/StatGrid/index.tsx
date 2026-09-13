/**
 * StatGrid —— 统计指标栅格（card 化的 `StatItem` 矩阵）。
 *
 * 用途：顶部概览面板（战力 / 灵石 / 修为 / 突破次数…）。
 * 复用：单元内部复用同组 `StatItem`，保证数值降级规则（`NaN` → `'-'`）一致。
 *
 * 列数（`column`）两种形态，语义与 `SlotBoard.columns` 一致：
 * - `number` —— 所有断点固定列数；
 * - 断点映射 —— 按视口切换，缺省键由 `DEFAULT_COLUMN` 补齐。
 *
 * **缺省是响应式的（手机 2 列 / ≥md 4 列），不是固定 4 列**：393px 手机上 4 列意味着每列
 * 只剩 ~70px，连「当前境界」这种 4 字标签都会被拆成「当前 / 境界」两行，数值说明更会一字一行。
 * 概览卡片的可读性下限就是 2 列。
 *
 * 边界：
 * - `items` 为空时渲染整行 `Empty`；
 * - `bordered` 控制 antd v6 `Card` 的 `variant`：`outlined` / `borderless`；
 * - 列数为 `0` / 负数 / `NaN` / `Infinity` 时按 1 列（`span=24`），绝不产出非法栅格或 `span=0`。
 */
import { Card, Col, Empty, Row, type ColProps } from 'antd';
import { StatItem, type StatItemProps } from '../StatItem/index.js';

/** 响应式断点（与 antd `Col` 的断点键一致）。 */
export type StatGridBreakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

export interface StatGridEntry extends StatItemProps {
  /** 稳定 key。 */
  key: string;
  /** 覆盖默认栅格占宽（固定 `span`，会同时覆盖所有断点）。 */
  span?: number;
}

export interface StatGridProps {
  /** 指标条目（只读）。 */
  items: readonly StatGridEntry[];
  /** 每行列数：数字 = 固定列数；对象 = 按断点响应式（缺省见 `DEFAULT_COLUMN`）。 */
  column?: number | Partial<Record<StatGridBreakpoint, number>>;
  /** 整组加载态（单项 `loading` 仍可单独覆盖）。 */
  loading?: boolean;
  /** 卡片是否带边框。 */
  bordered?: boolean;
}

/** 24 栅格总数。 */
const GRID_UNITS = 24;

/** 断点声明顺序（用于稳定生成 Col 属性）。 */
const BREAKPOINTS: readonly StatGridBreakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'];

/** 缺省列数：手机 2 列（可读性下限），≥md 回到 4 列。 */
const DEFAULT_COLUMN: Partial<Record<StatGridBreakpoint, number>> = { xs: 2, sm: 2, md: 4 };

/** 列数 → 24 栅格占宽；非法值（0 / 负数 / 非有限数）按 1 列，避免 `span=0` 或 `NaN`。 */
function spanOf(column: number): number {
  const count = Number.isFinite(column) ? Math.min(GRID_UNITS, Math.max(1, Math.trunc(column))) : 1;
  return Math.floor(GRID_UNITS / count);
}

/** 生成某一格的 `Col` 属性：条目自带 `span` 优先，其次数字，最后按断点补齐。 */
function colPropsFor(entrySpan: number | undefined, column: StatGridProps['column']): ColProps {
  if (entrySpan !== undefined) return { span: entrySpan };
  if (typeof column === 'number') return { span: spanOf(column) };

  const counts: Partial<Record<StatGridBreakpoint, number>> = { ...DEFAULT_COLUMN, ...(column ?? {}) };
  const props: Partial<Record<StatGridBreakpoint, number>> = {};
  for (const breakpoint of BREAKPOINTS) {
    const count = counts[breakpoint];
    if (count !== undefined) props[breakpoint] = spanOf(count);
  }
  return props;
}

export function StatGrid(props: StatGridProps) {
  const { items, column = DEFAULT_COLUMN, loading, bordered } = props;

  if (items.length === 0) {
    return (
      <Row data-testid="stat-grid-root" gutter={[16, 16]}>
        <Col span={24}>
          <Empty />
        </Col>
      </Row>
    );
  }

  return (
    <Row data-testid="stat-grid-root" gutter={[16, 16]}>
      {items.map((entry) => {
        const { key, span, ...statProps } = entry;
        return (
          <Col key={key} {...colPropsFor(span, column)}>
            <Card variant={bordered ? 'outlined' : 'borderless'}>
              <StatItem {...statProps} loading={loading ?? statProps.loading} />
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}
