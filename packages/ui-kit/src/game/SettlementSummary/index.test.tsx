/**
 * SettlementSummary：一次结算的产出摘要。
 * 覆盖：六段语义全量正常态、可选段缺省不渲染、零值不隐藏、
 * 非有限数 / 负数边界、resources 空对象与 nameOf 缺省、items 插槽、可访问性。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettlementSummary } from './index.js';

const NAMES: Record<string, string> = { gold: '金币', fire: '火精' };

describe('SettlementSummary', () => {
  it('正常：六段语义齐全时逐段显示，含总额、转换关系与资源标签', () => {
    render(
      <SettlementSummary
        lingyun={{ gained: 12, total: 30 }}
        kept={3}
        salvaged={{ count: 2, lingyun: 8 }}
        sold={{ count: 1, spiritStones: 50 }}
        discarded={0}
        blockedByTier={4}
        resources={{ currencies: { gold: 2 }, essences: { fire: 3 } }}
        // 目录里没有的 code 返回空串（而不是把 code 当名字回显）——与真实调用方口径一致
        nameOf={(code) => NAMES[code] ?? ''}
        items={<span>掉落清单</span>}
      />,
    );

    expect(screen.getByTestId('settlement-lingyun')).toHaveTextContent('+12（共 30）');
    expect(screen.getByTestId('settlement-lingyun').querySelector('.ant-tag')).not.toBeNull();
    expect(screen.getByTestId('settlement-kept')).toHaveTextContent('3 件');
    expect(screen.getByTestId('settlement-salvaged')).toHaveTextContent('2 件 → 灵韵 +8');
    expect(screen.getByTestId('settlement-sold')).toHaveTextContent('1 件 → 灵石 +50');
    expect(screen.getByTestId('settlement-discarded')).toHaveTextContent('0 件');
    expect(screen.getByTestId('settlement-blocked-by-tier')).toHaveTextContent('4 件');
    expect(screen.getByText('金币 ×2')).toBeInTheDocument();
    expect(screen.getByText('火精 ×3')).toBeInTheDocument();
    expect(screen.getByTestId('settlement-items')).toHaveTextContent('掉落清单');
  });

  it('可选段缺省：未传的段不渲染，必填段零值照常显示', () => {
    render(<SettlementSummary lingyun={{ gained: 0 }} kept={0} />);

    expect(screen.getByTestId('settlement-lingyun')).toHaveTextContent('0');
    expect(screen.getByTestId('settlement-kept')).toHaveTextContent('0 件');
    expect(screen.queryByTestId('settlement-salvaged')).toBeNull();
    expect(screen.queryByTestId('settlement-sold')).toBeNull();
    expect(screen.queryByTestId('settlement-discarded')).toBeNull();
    expect(screen.queryByTestId('settlement-blocked-by-tier')).toBeNull();
    expect(screen.queryByTestId('settlement-resources')).toBeNull();
    expect(screen.queryByTestId('settlement-items')).toBeNull();
  });

  it('边界：非有限数（NaN / Infinity）统一降级为 —，不把脏数据交给 antd', () => {
    render(
      <SettlementSummary
        lingyun={{ gained: Number.NaN, total: Number.POSITIVE_INFINITY }}
        kept={Number.NaN}
        salvaged={{ count: 2, lingyun: Number.POSITIVE_INFINITY }}
        discarded={Number.NaN}
        resources={{ currencies: { gold: Number.NaN } }}
        // 显式给名字，让本用例只盯「数值降级」，不与「未知 code 的命名回退」纠缠
        nameOf={() => '金'}
      />,
    );

    expect(screen.getByTestId('settlement-lingyun')).toHaveTextContent('—（共 —）');
    expect(screen.getByTestId('settlement-kept')).toHaveTextContent('—');
    expect(screen.getByTestId('settlement-salvaged')).toHaveTextContent('2 件 → 灵韵 —');
    expect(screen.getByTestId('settlement-discarded')).toHaveTextContent('—');
    expect(screen.getByText('金 ×—')).toBeInTheDocument();
  });

  it('边界：负数照常带符号显示，且不加正向 Tag', () => {
    render(
      <SettlementSummary
        lingyun={{ gained: -5, total: 1 }}
        kept={1}
        salvaged={{ count: 1, lingyun: -3 }}
        sold={{ count: 2, spiritStones: -20 }}
      />,
    );

    const lingyunCell = screen.getByTestId('settlement-lingyun');
    expect(lingyunCell).toHaveTextContent('-5（共 1）');
    expect(lingyunCell.querySelector('.ant-tag')).toBeNull();
    expect(screen.getByTestId('settlement-salvaged')).toHaveTextContent('1 件 → 灵韵 -3');
    expect(screen.getByTestId('settlement-sold')).toHaveTextContent('2 件 → 灵石 -20');
  });

  it('空对象与缺省 nameOf：空 resources 不出标签区，未知 code 显示占位而非 code', () => {
    const { unmount } = render(
      <SettlementSummary
        lingyun={{ gained: 1 }}
        kept={1}
        resources={{ currencies: {}, essences: {} }}
      />,
    );
    expect(screen.queryByTestId('settlement-resources')).toBeNull();
    unmount();

    render(
      <SettlementSummary
        lingyun={{ gained: 1 }}
        kept={1}
        resources={{ essences: { unknown: 4 } }}
      />,
    );
    // 协议 code 不许上屏：缺 nameOf / 名称为空串时退化为中文占位
    expect(screen.getByText('未知资源 ×4')).toBeInTheDocument();
    expect(screen.queryByText('unknown ×4')).toBeNull();
    expect(screen.getByTestId('settlement-resources').textContent).not.toContain('unknown');
  });

  it('nameOf 返回空串（目录未加载）时同样不外泄 code', () => {
    render(
      <SettlementSummary
        lingyun={{ gained: 1 }}
        kept={1}
        resources={{ currencies: { chaos: 2 } }}
        nameOf={() => ''}
      />,
    );
    expect(screen.getByText('未知资源 ×2')).toBeInTheDocument();
    expect(screen.getByTestId('settlement-resources').textContent).not.toContain('chaos');
  });

  it('可访问性：数值区是可读表格，六段语义标签齐全', () => {
    render(
      <SettlementSummary
        lingyun={{ gained: 1, total: 2 }}
        kept={1}
        salvaged={{ count: 1, lingyun: 1 }}
        sold={{ count: 1, spiritStones: 1 }}
        discarded={1}
        blockedByTier={1}
      />,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByTestId('settlement-summary-descriptions')).toBeInTheDocument();
    for (const label of ['灵韵', '保留物品', '分解', '出售', '弃置', '卡阶跳过']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
