/**
 * `palette` 单测 —— canvas 绘制拿不到 CSS 变量，必须把 token **取值后喂进去**
 * （全 canvas / 混合 canvas 的固有代价，见 `19-...md` §10 第 3 条）。
 * 这里守住两条：映射正确；**缺字段不抛错**（主题切换 / 局部 token 也能画）。
 */
import { describe, expect, it } from 'vitest';
import { paletteFromToken } from './palette.js';
import type { CanvasPaletteSource } from './palette.js';

const TOKEN: CanvasPaletteSource = {
  colorBgContainer: 'bg',
  colorBorderSecondary: 'border-2',
  colorBorder: 'border-1',
  colorTextQuaternary: 'text-4',
  colorTextTertiary: 'text-3',
  colorPrimary: 'primary',
};

describe('paletteFromToken', () => {
  it('逐字段映射到绘制配色（颜色全部来自 token，不内联 hex）', () => {
    const style = paletteFromToken(TOKEN);
    expect(style.background).toBe('bg');
    expect(style.worldBorder).toBe('border-1');
    expect(style.gridLine).toBe('border-2');
    expect(style.gridDot).toBe('text-4');
    expect(style.axisText).toBe('text-3');
    expect(style.link).toEqual({ color: 'text-3', width: 1.5, alpha: 0.45 });
    expect(style.linkActive).toEqual({ color: 'primary', width: 2.5, alpha: 0.9 });
    expect(style.linkLocked).toEqual({ color: 'text-4', width: 1.5, alpha: 0.35 });
  });

  it('激活线比普通线更粗更不透明（可交互靠饱和度区分，§19 §5）', () => {
    const style = paletteFromToken(TOKEN);
    expect(style.linkActive.width).toBeGreaterThan(style.link.width);
    expect(style.linkActive.alpha).toBeGreaterThan(style.link.alpha);
    expect(style.linkLocked.alpha).toBeLessThan(style.link.alpha);
  });

  it('缺字段 → 回退到同族兜底值，绝不抛错（主题中途切换也能画）', () => {
    const partial = { colorBgContainer: 'bg' } as CanvasPaletteSource;
    const style = paletteFromToken(partial);
    expect(style.background).toBe('bg');
    for (const value of [style.worldBorder, style.gridLine, style.gridDot, style.axisText]) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
    expect(style.link.color.length).toBeGreaterThan(0);
    expect(style.axisFontSize).toBeGreaterThan(0);
  });
});
