/**
 * NavBrand：展开态显示名称/副标题，折叠态只留图标（防截断）。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NavBrand } from './index.js';

describe('NavBrand', () => {
  it('展开态渲染图标、名称与副标题', () => {
    render(<NavBrand icon={<span data-testid="brand-icon">⚔</span>} title="修仙之路" subtitle="放置" />);
    expect(screen.getByTestId('brand-icon')).toBeInTheDocument();
    expect(screen.getByTestId('nav-brand-title')).toHaveTextContent('修仙之路');
    expect(screen.getByText('放置')).toBeInTheDocument();
  });

  it('折叠态只保留图标（名称与副标题不渲染，避免被截断）', () => {
    render(<NavBrand icon={<span data-testid="brand-icon">⚔</span>} title="修仙之路" subtitle="放置" collapsed />);
    expect(screen.getByTestId('brand-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-brand-title')).toBeNull();
    expect(screen.queryByText('放置')).toBeNull();
  });

  it('无图标也能渲染（不崩）', () => {
    render(<NavBrand title="修仙之路" />);
    expect(screen.getByTestId('nav-brand-title')).toHaveTextContent('修仙之路');
  });

  it('无副标题时只渲染一行', () => {
    render(<NavBrand title="修仙之路" />);
    expect(screen.getByTestId('nav-brand-title')).toBeInTheDocument();
  });
});
