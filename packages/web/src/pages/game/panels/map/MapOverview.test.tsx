/**
 * `MapOverview` 单测：五格统计的标签与数值，以及 §22 起「不再出现挂机格」的回归护栏。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapOverview } from './MapOverview.js';

describe('MapOverview', () => {
  it('渲染五格：战力 / 地点 / 传送点 / 已突破秘境 / 可突破秘境', () => {
    render(
      <MapOverview
        playerPower={123}
        nodeCount={17}
        waypointCount={4}
        clearedRealmCount={2}
        breakthroughableCount={3}
      />,
    );

    const overview = screen.getByTestId('map-overview');
    for (const label of ['我的战力', '已发现地点', '已点亮传送点', '已突破秘境', '可突破秘境']) {
      expect(overview).toHaveTextContent(label);
    }
    expect(overview).toHaveTextContent('123');
    expect(overview).toHaveTextContent('17');
    expect(overview).toHaveTextContent('4');
    expect(overview).toHaveTextContent('2');
    expect(overview).toHaveTextContent('3');
  });

  it('§22 回归护栏：不再出现「已解锁离线挂机」（挂机已随秘境与地图解耦）', () => {
    render(
      <MapOverview
        playerPower={0}
        nodeCount={0}
        waypointCount={0}
        clearedRealmCount={0}
        breakthroughableCount={0}
      />,
    );

    const overview = screen.getByTestId('map-overview');
    // 旧统计里有一格按地图节点数算的「秘境」与一格「已解锁离线挂机」；两者都已删除。
    expect(overview).not.toHaveTextContent('已解锁离线挂机');
    expect(overview).toHaveTextContent('已突破秘境');
    expect(overview).toHaveTextContent('可突破秘境');
  });

  it('零值也照常渲染（新角色：0 战力 / 0 地点 / 0 秘境）', () => {
    render(
      <MapOverview playerPower={0} nodeCount={0} waypointCount={0} clearedRealmCount={0} breakthroughableCount={0} />,
    );

    expect(screen.getByTestId('map-overview')).toBeInTheDocument();
  });
});