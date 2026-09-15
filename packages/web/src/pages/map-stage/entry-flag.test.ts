/**
 * `shouldUseMapStage` 单测 —— 入口开关决定「用户看到的是新舞台还是旧入口」，
 * 判错会让验收跑到别的页面上，所以边界逐个钉死（与 `map-lab/entry-flag.test.ts` 对称）。
 */
import { describe, expect, it } from 'vitest';
import { MAP_STAGE_PARAM, shouldUseMapStage } from './entry-flag.js';

describe('shouldUseMapStage', () => {
  it('⭐ 只认 mapStage=1', () => {
    expect(shouldUseMapStage('?mapStage=1')).toBe(true);
  });

  it('带不带问号都接受，且夹在其他参数之间也认', () => {
    expect(shouldUseMapStage('mapStage=1')).toBe(true);
    expect(shouldUseMapStage('?a=1&mapStage=1&b=2')).toBe(true);
  });

  it('只有完整值 1 才算（0 / true / 空串 / 大小写不符 一律回退旧入口）', () => {
    for (const search of ['?mapStage=0', '?mapStage=true', '?mapStage=', '?mapstage=1', '?mapStage=11']) {
      expect(shouldUseMapStage(search)).toBe(false);
    }
  });

  it('没有该参数 ⇒ false（不得把默认路径改掉）', () => {
    expect(shouldUseMapStage('')).toBe(false);
    expect(shouldUseMapStage('?mapLab=1')).toBe(false);
  });

  it('重复参数取第一个（与 URLSearchParams.get 一致）', () => {
    expect(shouldUseMapStage('?mapStage=1&mapStage=0')).toBe(true);
    expect(shouldUseMapStage('?mapStage=0&mapStage=1')).toBe(false);
  });

  it('非法输入不抛错（非字符串 / 畸形 search）', () => {
    expect(shouldUseMapStage(undefined as unknown as string)).toBe(false);
    expect(shouldUseMapStage(null as unknown as string)).toBe(false);
    expect(shouldUseMapStage(1 as unknown as string)).toBe(false);
    expect(() => shouldUseMapStage('?%')).not.toThrow();
  });

  it('参数名常量唯一（避免文档与代码写岔）', () => {
    expect(MAP_STAGE_PARAM).toBe('mapStage');
  });
});
