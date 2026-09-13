/**
 * DropPoolTable：权重 → 概率、按类别小计、非有限/负数/零总额边界、空态与 loading 透传。
 * 覆盖：正常渲染 / 空数据 / 边界（NaN / 负数 / 总权重 0）/ 开关列 / 可访问性。
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DropPoolTable } from './index.js';

interface Entry {
  id: string;
  kind: string;
  name: string;
  weight: number;
}

const KIND_NAMES: Record<string, string> = { weapon: '武器', material: '材料' };

const ENTRIES: readonly Entry[] = [
  { id: 'a', kind: 'weapon', name: '青锋剑', weight: 3 },
  { id: 'b', kind: 'weapon', name: '玄铁刀', weight: 1 },
  { id: 'c', kind: 'material', name: '火精', weight: 4 },
  { id: 'd', kind: 'material', name: '寒铁', weight: 0 },
];

/** 统一 props：默认按 id 取 key、按 kind 分组、按 kind 给中文名。 */
function renderTable(overrides: Partial<Parameters<typeof DropPoolTable<Entry>>[0]> = {}) {
  return render(
    <DropPoolTable<Entry>
      entries={ENTRIES}
      weightOf={(entry) => entry.weight}
      kindOf={(entry) => entry.kind}
      labelOf={(entry) => entry.name}
      kindLabelOf={(kind) => KIND_NAMES[kind] ?? kind}
      keyOf={(entry) => entry.id}
      {...overrides}
    />,
  );
}

describe('DropPoolTable · 正常渲染', () => {
  it('逐行显示名称 / 类别 / 权重 / 概率（总权重 8 → 百分比保留 1 位）', () => {
    renderTable();

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByTestId('drop-pool-label-a')).toHaveTextContent('青锋剑');
    expect(screen.getByTestId('drop-pool-kind-a')).toHaveTextContent('武器');
    expect(screen.getByTestId('drop-pool-weight-a')).toHaveTextContent('3');
    expect(screen.getByTestId('drop-pool-probability-a')).toHaveTextContent('37.5%');
    expect(screen.getByTestId('drop-pool-probability-c')).toHaveTextContent('50.0%');
    expect(screen.getByTestId('drop-pool-probability-d')).toHaveTextContent('0.0%');
  });

  it('按类别给出小计行：类别概率合计（权重合计 + 概率合计）', () => {
    renderTable();

    const weapon = screen.getByTestId('drop-pool-subtotal-weapon');
    expect(weapon).toHaveTextContent('武器 合计');
    expect(weapon).toHaveTextContent('4');
    expect(within(weapon).getByTestId('drop-pool-subtotal-probability-weapon')).toHaveTextContent('50.0%');

    expect(screen.getByTestId('drop-pool-subtotal-probability-material')).toHaveTextContent('50.0%');
  });

  it('无 kindOf 时不渲染类别列与任何小计行', () => {
    renderTable({ kindOf: undefined });

    expect(screen.queryByTestId('drop-pool-kind-a')).toBeNull();
    expect(screen.queryByTestId('drop-pool-table-summary')).toBeNull();
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
  });

  it('showProbability=false 时去掉概率列，权重照常显示', () => {
    renderTable({ showProbability: false });

    expect(screen.queryByTestId('drop-pool-probability-a')).toBeNull();
    expect(screen.getByTestId('drop-pool-weight-a')).toHaveTextContent('3');
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
  });
});

describe('DropPoolTable · 边界', () => {
  it('空数据：渲染 emptyText 与表头，不出现小计行', () => {
    renderTable({ entries: [], emptyText: '该池没有掉落条目' });

    expect(screen.getByText('该池没有掉落条目')).toBeInTheDocument();
    expect(screen.queryByTestId('drop-pool-table-summary')).toBeNull();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('总权重为 0（全 0 / 全非有限）→ 概率列显示 —，绝不出现 NaN / Infinity', () => {
    const zero: readonly Entry[] = [
      { id: 'x', kind: 'weapon', name: '甲', weight: 0 },
      { id: 'y', kind: 'weapon', name: '乙', weight: Number.NaN },
      { id: 'z', kind: 'material', name: '丙', weight: Number.POSITIVE_INFINITY },
    ];
    renderTable({ entries: zero });

    for (const id of ['x', 'y', 'z']) {
      expect(screen.getByTestId(`drop-pool-probability-${id}`)).toHaveTextContent('—');
      expect(screen.getByTestId(`drop-pool-weight-${id}`)).toHaveTextContent('0');
    }
    expect(screen.getByTestId('drop-pool-subtotal-probability-weapon')).toHaveTextContent('—');
    expect(screen.getByTestId('drop-pool-table-root')).not.toHaveTextContent('NaN');
    expect(screen.getByTestId('drop-pool-table-root')).not.toHaveTextContent('Infinity');
  });

  it('权重负数按 0 处理，不产生负概率', () => {
    const withNegative: readonly Entry[] = [
      { id: 'n', kind: 'weapon', name: '负权重', weight: -5 },
      { id: 'p', kind: 'weapon', name: '正权重', weight: 10 },
    ];
    renderTable({ entries: withNegative });

    expect(screen.getByTestId('drop-pool-weight-n')).toHaveTextContent('0');
    expect(screen.getByTestId('drop-pool-probability-n')).toHaveTextContent('0.0%');
    expect(screen.getByTestId('drop-pool-probability-p')).toHaveTextContent('100.0%');
    expect(screen.getByTestId('drop-pool-table-root')).not.toHaveTextContent('-');
  });

  it('缺省 keyOf 时退化为索引，行仍可定位；loading 透传给 antd', () => {
    renderTable({ keyOf: undefined, loading: true });

    expect(screen.getByTestId('drop-pool-label-0')).toHaveTextContent('青锋剑');
    expect(screen.getByTestId('drop-pool-label-3')).toHaveTextContent('寒铁');
    // antd 的 loading 蒙层由 Table 内部包一层 `.ant-spin-nested-loading` 渲染（不在 root 之下）。
    expect(document.querySelector('.ant-spin')).not.toBeNull();
  });
});

describe('DropPoolTable · 可访问性', () => {
  it('列头名称齐全，小计行落在表格内', () => {
    renderTable();

    for (const title of ['名称', '类别', '权重', '概率']) {
      expect(screen.getByRole('columnheader', { name: title })).toBeInTheDocument();
    }
    expect(within(screen.getByRole('table')).getByTestId('drop-pool-subtotal-weapon')).toBeInTheDocument();
  });
});
