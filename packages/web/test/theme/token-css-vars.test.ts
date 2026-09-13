/**
 * antd token → CSS 变量桥的边界：只写已定义值、跳过 undefined/空串/非有限数。
 */
import type { GlobalToken } from 'antd';
import { describe, expect, it } from 'vitest';
import { applyTokenCssVars, TOKEN_CSS_VAR_MAP, type CssVarTarget } from '../../src/theme/token-css-vars.js';

function fakeTarget(): CssVarTarget & { read(name: string): string | undefined; names(): string[] } {
  const map = new Map<string, string>();
  return {
    style: {
      setProperty(name: string, value: string) {
        map.set(name, value);
      },
    },
    read: (name) => map.get(name),
    names: () => [...map.keys()],
  };
}

describe('TOKEN_CSS_VAR_MAP', () => {
  it('变量名统一 --app- 前缀且无重复值', () => {
    const names = Object.keys(TOKEN_CSS_VAR_MAP);
    expect(names.every((n) => n.startsWith('--app-'))).toBe(true);
    expect(new Set(Object.values(TOKEN_CSS_VAR_MAP)).size).toBe(names.length);
  });

  it('覆盖主题所需的最小集（背景/文字/边框/主色/语义色）', () => {
    for (const required of ['--app-bg', '--app-text', '--app-border', '--app-accent', '--app-ok', '--app-warn', '--app-bad']) {
      expect(Object.keys(TOKEN_CSS_VAR_MAP)).toContain(required);
    }
  });
});

describe('applyTokenCssVars', () => {
  it('字符串 token 原样写入', () => {
    const target = fakeTarget();
    applyTokenCssVars(target, { colorBgLayout: '#123456', colorText: '#abcdef' } as Partial<GlobalToken>);
    expect(target.read('--app-bg')).toBe('#123456');
    expect(target.read('--app-text')).toBe('#abcdef');
  });

  it('数字 token 转字符串（如字号/圆角）', () => {
    const target = fakeTarget();
    applyTokenCssVars(target, { borderRadius: 6 } as Partial<GlobalToken>);
    // borderRadius 未登记在映射里 → 不应写入任何变量（映射表是白名单）
    expect(target.names()).toHaveLength(0);
  });

  it('缺失 token 跳过写入（不写 undefined）', () => {
    const target = fakeTarget();
    applyTokenCssVars(target, {} as Partial<GlobalToken>);
    expect(target.names()).toHaveLength(0);
  });

  it('空串 / null / NaN / Infinity 一律跳过', () => {
    const target = fakeTarget();
    applyTokenCssVars(target, {
      colorBgLayout: '',
      colorText: null,
      colorBorderSecondary: Number.NaN,
      colorTextSecondary: Number.POSITIVE_INFINITY,
    } as unknown as Partial<GlobalToken>);
    expect(target.names()).toHaveLength(0);
  });

  it('部分 token 存在时只写存在项（保留其余 CSS 兜底值）', () => {
    const target = fakeTarget();
    applyTokenCssVars(target, { colorBgLayout: '#000000' } as Partial<GlobalToken>);
    expect(target.names()).toEqual(['--app-bg']);
  });

  it('全量 token 时写满映射表', () => {
    const target = fakeTarget();
    const full = Object.fromEntries(Object.values(TOKEN_CSS_VAR_MAP).map((key) => [key, '#111111']));
    applyTokenCssVars(target, full as unknown as Partial<GlobalToken>);
    expect(target.names()).toHaveLength(Object.keys(TOKEN_CSS_VAR_MAP).length);
  });
});
