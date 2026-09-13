/**
 * MapNodeBadge 单测：三态文案 + 预设色 class（不断言 hex）+ compact 短文案。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapNodeBadge } from './MapNodeBadge.js';

describe('MapNodeBadge · 完整文案（详情卡）', () => {
  it('三态齐备时三条文案都在', () => {
    render(<MapNodeBadge visited waypointUnlocked idleUnlocked />);
    expect(screen.getByTestId('map-node-badge-visited')).toHaveTextContent('已到达');
    expect(screen.getByTestId('map-node-badge-waypoint')).toHaveTextContent('传送点已点亮');
    expect(screen.getByTestId('map-node-badge-idle')).toHaveTextContent('离线挂机已解锁');
  });

  it('语义色走 antd 预设色名（processing / gold / success）', () => {
    render(<MapNodeBadge visited waypointUnlocked idleUnlocked />);
    expect(screen.getByTestId('map-node-badge-visited')).toHaveClass('ant-tag-processing');
    expect(screen.getByTestId('map-node-badge-waypoint')).toHaveClass('ant-tag-gold');
    expect(screen.getByTestId('map-node-badge-idle')).toHaveClass('ant-tag-success');
  });

  it('未到达：文案为「未到达」，且不渲染传送/挂机徽标', () => {
    render(<MapNodeBadge visited={false} waypointUnlocked={false} idleUnlocked={false} />);
    expect(screen.getByTestId('map-node-badge-visited')).toHaveTextContent('未到达');
    expect(screen.queryByTestId('map-node-badge-waypoint')).toBeNull();
    expect(screen.queryByTestId('map-node-badge-idle')).toBeNull();
  });

  it('已到达但未点亮传送点：只有到达徽标', () => {
    render(<MapNodeBadge visited waypointUnlocked={false} idleUnlocked={false} />);
    expect(screen.getByTestId('map-node-badge-visited')).toHaveTextContent('已到达');
    expect(screen.queryByTestId('map-node-badge-waypoint')).toBeNull();
  });
});

describe('MapNodeBadge · compact（线路图小点）', () => {
  it('用短文案', () => {
    render(<MapNodeBadge visited waypointUnlocked idleUnlocked compact />);
    expect(screen.getByTestId('map-node-badge-visited')).toHaveTextContent('已到');
    expect(screen.getByTestId('map-node-badge-waypoint')).toHaveTextContent('传送');
    expect(screen.getByTestId('map-node-badge-idle')).toHaveTextContent('挂机');
    expect(screen.getByTestId('map-node-badge')).toHaveAttribute('data-compact', 'true');
  });
});
