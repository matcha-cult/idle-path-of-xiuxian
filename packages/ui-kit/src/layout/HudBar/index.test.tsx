/**
 * HudBar：条目渲染、骨架、右侧操作、空条目、tooltip。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HudBar } from './index.js';

const items = [
  { key: 'realm', label: '境界', value: '筑基三境' },
  { key: 'lingyun', label: '灵韵', value: 1280 },
  { key: 'hint', label: '提示', value: '—', tooltip: '鼠标悬浮说明' },
];

describe('HudBar', () => {
  it('渲染每个条目的标签与取值', () => {
    render(<HudBar items={items} />);
    expect(screen.getByText('境界')).toBeInTheDocument();
    expect(screen.getByTestId('hud-item-realm')).toHaveTextContent('筑基三境');
    expect(screen.getByTestId('hud-item-lingyun')).toHaveTextContent('1280');
    expect(screen.getByTestId('hud-item-hint')).toBeInTheDocument();
  });

  it('loading 时显示骨架且不渲染取值', () => {
    const { container } = render(<HudBar items={items} loading />);
    expect(screen.queryByTestId('hud-item-realm')).toBeNull();
    expect(container.querySelectorAll('.ant-skeleton').length).toBeGreaterThan(0);
  });

  it('右侧 extra 插槽渲染', () => {
    render(<HudBar items={[]} extra={<span data-testid="hud-extra">连接状态</span>} />);
    expect(screen.getByTestId('hud-extra')).toBeInTheDocument();
  });

  it('空条目列表不崩，且不产生条目节点', () => {
    render(<HudBar items={[]} />);
    expect(screen.getByTestId('hud-bar-root')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^hud-item-/)).toHaveLength(0);
  });

  it('tooltip 条目仍渲染取值（气泡内容不阻塞展示）', () => {
    render(<HudBar items={items} />);
    expect(screen.getByTestId('hud-item-hint')).toHaveTextContent('—');
  });
});
