/**
 * SlotBoard —— 固定槽位板（装备栏 / 功法槽），布局通用组。
 *
 * 用途：装备面板的固定部位格、功法面板的心法/术法槽等一切「位置固定 + 可空 + 可点」的槽位阵列。
 * 约定：
 * - 结构只用 antd `Row` / `Col` + `Card` + `Flex` + `Typography`，不自研网格；
 * - `tone` 只影响边框色，且必须来自 `theme.useToken()`（禁内联 hex）；
 * - `onClick` 存在时整格可点：`role="button"` + `tabIndex=0` + Enter/Space 键盘触发；
 * - 纯展示、受控、无副作用，不 import 任何业务包。
 *
 * 边界：`slots=[]` → 渲染空网格不崩；`item` 未传（`undefined` / `null`）走 `empty`；
 *       `dashed=false` 时空槽也不加虚线；`columns` 为数字时用固定 span，为对象时按断点换算列数。
 */
import { Card, Col, Flex, Row, Typography, theme } from 'antd';
import type { KeyboardEvent, ReactNode } from 'react';

export interface SlotBoardItem {
  key: string;
  label: ReactNode;
  /** 槽内内容（通常传 ItemCard 或技能摘要）。 */
  item?: ReactNode;
  /** 空槽文案，缺省「空」。 */
  empty?: ReactNode;
  onClick?: () => void;
}

export type SlotBoardBreakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

export interface SlotBoardProps {
  slots: readonly SlotBoardItem[];
  /** 响应式列数，缺省 `{xs:2, sm:3, md:4, lg:5}`。 */
  columns?: number | Partial<Record<SlotBoardBreakpoint, number>>;
  /** 语义色调（仅影响边框/标签色，走 token）。 */
  tone?: 'equip' | 'skill';
  /** 空槽占位是否显示虚线边框，缺省 true。 */
  dashed?: boolean;
}

/** antd 24 栅格总数。 */
const GRID_UNITS = 24;

/** 缺省响应式列数（对象形式的基底，缺省键由此补齐）。 */
const DEFAULT_COLUMNS: Partial<Record<SlotBoardBreakpoint, number>> = { xs: 2, sm: 3, md: 4, lg: 5 };

/** 断点声明顺序（用于稳定生成 Col 属性）。 */
const BREAKPOINTS: readonly SlotBoardBreakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'];

/**
 * 列数 → 24 栅格占宽。不能整除时把余数摊给**前几列**，
 * 使每一整行恰好铺满 24（如 5 列 → 5/5/5/5/4）。
 * 非有限数 / 负数 / 0 → 按 1 列；超过 24 → 按 24 列。
 */
function spanFor(index: number, columns: number): number {
  const count = Number.isFinite(columns) ? Math.min(GRID_UNITS, Math.max(1, Math.trunc(columns))) : 1;
  const base = Math.floor(GRID_UNITS / count);
  const remainder = GRID_UNITS % count;
  return base + (index % count < remainder ? 1 : 0);
}

/** 生成某一格的 Col 属性：数字 → 固定 `span`；对象 → 按断点补齐缺省后的响应式 span。 */
function colPropsFor(
  columns: SlotBoardProps['columns'],
  index: number,
): { span: number } | Partial<Record<SlotBoardBreakpoint, number>> {
  if (typeof columns === 'number') return { span: spanFor(index, columns) };
  const counts: Partial<Record<SlotBoardBreakpoint, number>> = { ...DEFAULT_COLUMNS, ...(columns ?? {}) };
  const props: Partial<Record<SlotBoardBreakpoint, number>> = {};
  for (const breakpoint of BREAKPOINTS) {
    const count = counts[breakpoint];
    if (count !== undefined) props[breakpoint] = spanFor(index, count);
  }
  return props;
}

/** Enter / Space 触发点击（与原生 button 行为一致）。 */
function activateOnKey(event: KeyboardEvent<HTMLDivElement>, action: () => void): void {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault();
    action();
  }
}

export function SlotBoard(props: SlotBoardProps) {
  const { slots, columns, tone, dashed = true } = props;
  const { token } = theme.useToken();
  const borderColor =
    tone === 'skill' ? token.colorWarningBorder : tone === 'equip' ? token.colorPrimaryBorder : token.colorBorder;

  return (
    <Row data-testid="slot-board-root" gutter={[token.marginSM, token.marginSM]}>
      {slots.map((slot, index) => {
        const filled = slot.item !== undefined && slot.item !== null;
        const onClick = slot.onClick;
        return (
          <Col key={slot.key} {...colPropsFor(columns, index)}>
            <Card
              data-testid="slot-board-slot"
              data-slot-key={slot.key}
              data-filled={filled ? 'true' : 'false'}
              variant="outlined"
              hoverable={onClick !== undefined}
              onClick={onClick}
              role={onClick === undefined ? undefined : 'button'}
              tabIndex={onClick === undefined ? undefined : 0}
              onKeyDown={
                onClick === undefined ? undefined : (event) => {
                  activateOnKey(event, onClick);
                }
              }
              style={{ borderColor, borderStyle: filled || !dashed ? 'solid' : 'dashed' }}
            >
              <Flex vertical gap={token.marginXS} data-testid="slot-board-body">
                <Typography.Text type="secondary" data-testid="slot-board-label">
                  {slot.label}
                </Typography.Text>
                {filled ? (
                  <Flex vertical data-testid="slot-board-item">
                    {slot.item}
                  </Flex>
                ) : (
                  <Typography.Text type="secondary" data-testid="slot-board-empty">
                    {slot.empty ?? '空'}
                  </Typography.Text>
                )}
              </Flex>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}
