/**
 * FeatureGate 单测：渲染「未开放」+ **入口确实被禁用** + 不回显 featureKey 原文。
 */
import { render, screen } from '@testing-library/react';
import { Button } from 'antd';
import { describe, expect, it } from 'vitest';
import { FeatureGate } from './FeatureGate.js';

describe('FeatureGate · 未开放渲染', () => {
  it('渲染「未开放」与承载系统名', () => {
    render(<FeatureGate label="炼丹" />);
    const gate = screen.getByTestId('feature-gate');
    expect(gate).toHaveTextContent('未开放');
    expect(gate).toHaveTextContent('炼丹');
  });

  it('传入的入口被强制禁用（调用方无法忘记禁用）', () => {
    render(<FeatureGate label="御兽" entry={<Button data-testid="entry">进入御兽</Button>} />);
    expect(screen.getByTestId('entry')).toBeDisabled();
  });

  it('未传入口时不渲染入口区', () => {
    render(<FeatureGate label="斗法" />);
    expect(screen.queryByTestId('feature-gate-entry')).toBeNull();
  });

  it('不显示协议 featureKey 原文（只显示中文展示名）', () => {
    render(<FeatureGate label="灵田" />);
    expect(screen.getByTestId('feature-gate')).not.toHaveTextContent('farm');
    expect(screen.getByTestId('feature-gate')).not.toHaveTextContent('featureKey');
  });
});
