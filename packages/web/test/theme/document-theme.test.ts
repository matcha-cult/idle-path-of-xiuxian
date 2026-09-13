/**
 * data-theme / color-scheme 标记（防闪烁 + 原生控件配色）。
 * 用结构化假目标，不依赖真实 DOM。
 */
import { describe, expect, it } from 'vitest';
import { applyDocumentTheme, readDocumentTheme, type ThemeMarkTarget } from '../../src/theme/document-theme.js';

function fakeTarget(): ThemeMarkTarget {
  const dataset: Record<string, string | undefined> = {};
  const props: Record<string, string> = {};
  return {
    dataset: dataset as unknown as DOMStringMap,
    style: {
      get colorScheme() {
        return props['colorScheme'] ?? '';
      },
      set colorScheme(value: string) {
        props['colorScheme'] = value;
      },
    } as CSSStyleDeclaration,
  };
}

describe('applyDocumentTheme / readDocumentTheme', () => {
  it.each(['light', 'dark'] as const)('%s 同时写入 data-theme 与 color-scheme', (mode) => {
    const target = fakeTarget();
    applyDocumentTheme(target, mode);
    expect(target.dataset['theme']).toBe(mode);
    expect(target.style.colorScheme).toBe(mode);
    expect(readDocumentTheme(target)).toBe(mode);
  });

  it('未设置时读回 null', () => {
    expect(readDocumentTheme(fakeTarget())).toBeNull();
  });

  it('被外部写成非法值时读回 null（不误判为亮色）', () => {
    const target = fakeTarget();
    target.dataset['theme'] = 'system';
    expect(readDocumentTheme(target)).toBeNull();
  });

  it('可重复覆盖（切换来回）', () => {
    const target = fakeTarget();
    applyDocumentTheme(target, 'dark');
    applyDocumentTheme(target, 'light');
    expect(readDocumentTheme(target)).toBe('light');
    expect(target.style.colorScheme).toBe('light');
  });
});
