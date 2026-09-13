/**
 * StatGrid —— 统计指标栅格（card 化的 `StatItem` 矩阵）。
 *
 * 用途：顶部概览面板（战力 / 灵石 / 修为 / 突破次数…）。
 * 复用：单元内部复用同组 `StatItem`，保证数值降级规则（`NaN` → `'-'`）一致。
 *
 * 边界：
 * - `items` 为空时渲染整行 `Empty`；
 * - `bordered` 控制 antd v6 `Card` 的 `variant`：`outlined` / `borderless`；
 * - `column` 缺省 4，按 24 栅格换算 span（非整除时向下取整）。
 */
import { Card, Col, Empty, Row } from 'antd';
import { StatItem, type StatItemProps } from '../StatItem/index.js';

export interface StatGridEntry extends StatItemProps {
  /** 稳定 key。 */
  key: string;
  /** 覆盖默认栅格占宽。 */
  span?: number;
}

export interface StatGridProps {
  /** 指标条目（只读）。 */
  items: readonly StatGridEntry[];
  /** 每行列数，缺省 4。 */
  column?: number;
  /** 整组加载态（单项 `loading` 仍可单独覆盖）。 */
  loading?: boolean;
  /** 卡片是否带边框。 */
  bordered?: boolean;
}

/** 24 栅格总数。 */
const GRID_UNITS = 24;

export function StatGrid(props: StatGridProps) {
  const { items, column = 4, loading, bordered } = props;

  const spanFor = (entrySpan?: number): number =>
    entrySpan ?? Math.floor(GRID_UNITS / (column > 0 ? column : 1));

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
          <Col key={key} span={spanFor(span)}>
            <Card variant={bordered ? 'outlined' : 'borderless'}>
              <StatItem {...statProps} loading={loading ?? statProps.loading} />
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}
