/**
 * `entry-flag` 单测 —— 入口开关决定「走新链路还是旧链路」，判错就会把旧面板顶掉，
 * 因此把边界全部钉住：只有完整值 `1` 才算开，其余一律回退旧入口。
 */
import { describe, expect, it } from 'vitest';
import { MAP_LAB_PARAM, shouldUseMapLab } from './entry-flag.js';

describe('shouldUseMapLab', () => {
  it('?mapLab=1 → 开', () => {
    expect(shouldUseMapLab('?mapLab=1')).toBe(true);
  });

  it('不带 ? 也接受（某些环境已剥掉问号）', () => {
    expect(shouldUseMapLab('mapLab=1')).toBe(true);
  });

  it('和其它参数共存时仍然生效', () => {
    expect(shouldUseMapLab('?mapGrid=1&mapLab=1')).toBe(true);
    expect(shouldUseMapLab('?mapLab=1&mapGrid=1')).toBe(true);
  });

  it('⭐ 缺省 / 非法值一律回退**旧入口**（绝不能把旧面板顶掉）', () => {
    for (const search of [
      '',
      '?',
      '?mapLab=0',
      '?mapLab=true',
      '?mapLab=',
      '?mapLab=x',
      '?maplab=1', // 大小写敏感
      '?mapGrid=1',
    ]) {
      expect(shouldUseMapLab(search)).toBe(false);
    }
  });

  it('重复参数取第一个（与 URLSearchParams.get 一致）', () => {
    expect(shouldUseMapLab('?mapLab=0&mapLab=1')).toBe(false);
    expect(shouldUseMapLab('?mapLab=1&mapLab=0')).toBe(true);
  });

  it('非法 search 不抛错（防御式，回退旧入口）', () => {
    expect(shouldUseMapLab(undefined as unknown as string)).toBe(false);
    expect(shouldUseMapLab(null as unknown as string)).toBe(false);
    expect(shouldUseMapLab(1 as unknown as string)).toBe(false);
  });

  it('参数名是常量（避免两处写死字符串漂移）', () => {
    expect(MAP_LAB_PARAM).toBe('mapLab');
  });
});
