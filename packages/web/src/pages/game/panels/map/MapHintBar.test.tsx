/**
 * `MapHintBar`：常驻提示条的**分平台文案**。
 *
 * 这条不是装饰：§12.3 明确写了「点击只选中」是反直觉规则，必须有一条常驻文案教它，
 * 否则玩家会以为「点不动 = 坏了」。所以断言的是**文案本身**（含规则要点），不是样式。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapHintBar } from './MapHintBar.js';

describe('MapHintBar', () => {
  it('PC 文案：点击查看详情 + 双击前往 + 传送点交互规则', () => {
    render(<MapHintBar touch={false} />);
    const hint = screen.getByTestId('map-hint-bar');
    expect(hint).toHaveTextContent('点击枢纽查看详情');
    expect(hint).toHaveTextContent('双击前往');
    expect(hint).toHaveTextContent('须在枢纽处与传送点交互方可点亮');
  });

  it('触屏文案：轻点查看 + 点「前往」移动（没有双击，也不说「点击」）', () => {
    render(<MapHintBar touch />);
    const hint = screen.getByTestId('map-hint-bar');
    expect(hint).toHaveTextContent('轻点枢纽查看详情');
    expect(hint).toHaveTextContent('点「前往」移动');
    expect(hint).not.toHaveTextContent('双击');
  });

  it('不说「单击即前往」这类会误导的动作（唯一的规范移动路径是右栏按钮）', () => {
    render(<MapHintBar touch={false} />);
    expect(screen.getByTestId('map-hint-bar').textContent).not.toContain('点击前往');
  });
});
