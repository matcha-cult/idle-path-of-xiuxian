/**
 * `MapLabNotice` 单测 —— 这段说明是**诚实性门禁**：必须上屏三件事（新链路、
 * 「交互才解锁传送」、以及「点亮是会话态」），否则评审会把原型当成品。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapLabNotice } from './MapLabNotice.js';

describe('MapLabNotice', () => {
  it('说明这是新链路，并给出回旧入口的方法', () => {
    render(<MapLabNotice />);
    const notice = screen.getByTestId('map-lab-notice');
    expect(notice).toHaveTextContent('地图交互实践入口');
    expect(notice).toHaveTextContent('canvas 混合渲染');
    expect(notice).toHaveTextContent('?mapLab=1');
  });

  it('说明三条手势（滚轮 / 捏合 / 拖动）都在', () => {
    render(<MapLabNotice />);
    const notice = screen.getByTestId('map-lab-notice');
    expect(notice).toHaveTextContent('滚轮');
    expect(notice).toHaveTextContent('捏合');
    expect(notice).toHaveTextContent('拖动平移');
  });

  it('⭐ 必须写明「点亮是会话态、持久化待后端」—— 不能假装功能已完成', () => {
    render(<MapLabNotice />);
    const notice = screen.getByTestId('map-lab-notice');
    expect(notice).toHaveTextContent('本次会话');
    expect(notice).toHaveTextContent('map.interact');
  });

  it('写明机制：必须与传送点交互后才解锁传送', () => {
    render(<MapLabNotice />);
    expect(screen.getByTestId('map-lab-notice')).toHaveTextContent('必须与传送点交互后才解锁传送');
  });
});
