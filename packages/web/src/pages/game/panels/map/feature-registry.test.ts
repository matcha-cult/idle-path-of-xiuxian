/**
 * feature-registry 单测：**「是否实现」是客户端判断**，且未实现系统一个不漏。
 * 这条测试是任务书 §4 的可执行版本 —— 实现进度变化时它会失败，提醒维护者更新注册表。
 */
import { describe, expect, it } from 'vitest';
import {
  FEATURE_PANELS,
  REALM_FEATURE_KEY,
  UNIMPLEMENTED_FEATURES,
  featureIsImplemented,
  featureLabelOf,
  featurePanelOf,
} from './feature-registry.js';

/** 任务书 §4 明确的「入图但未实现」系统（§22 起 `realm` 已实现，故不在列）。 */
const EXPECTED_UNIMPLEMENTED = ['alchemy', 'beast', 'farm', 'pvp', 'discipline', 'profession'];

describe('feature-registry · 已实现系统', () => {
  it('登记了 5 个已实现系统（§22 起新增 realm）', () => {
    expect(Object.keys(FEATURE_PANELS).sort()).toEqual(['craft', 'quest', 'realm', 'skill', 'waypoint']);
  });

  it('已实现系统返回 true 并给出承载面板', () => {
    for (const key of ['skill', 'craft', 'quest', 'waypoint', REALM_FEATURE_KEY]) {
      expect(featureIsImplemented(key)).toBe(true);
      expect(featurePanelOf(key)).not.toBeNull();
    }
  });

  it('§22：秘境（realm）已实现，展示名「秘境」，承载面板是秘境面板', () => {
    expect(REALM_FEATURE_KEY).toBe('realm');
    expect(featureLabelOf(REALM_FEATURE_KEY)).toBe('秘境');
    expect(featurePanelOf(REALM_FEATURE_KEY)).toBe('zone');
    expect(UNIMPLEMENTED_FEATURES).not.toContain(REALM_FEATURE_KEY);
  });

  it('featureKey 为 null（纯跑图）不算已实现，也没有面板', () => {
    expect(featureIsImplemented(null)).toBe(false);
    expect(featurePanelOf(null)).toBeNull();
    expect(featureLabelOf(null)).toBeNull();
  });
});

describe('feature-registry · 未实现系统', () => {
  it('6 个未实现系统全部判为未实现', () => {
    expect(UNIMPLEMENTED_FEATURES.slice().sort()).toEqual(EXPECTED_UNIMPLEMENTED.slice().sort());
    for (const key of EXPECTED_UNIMPLEMENTED) {
      expect(featureIsImplemented(key)).toBe(false);
      expect(featurePanelOf(key)).toBeNull();
    }
  });

  it('原型链上的属性名不得被误判为已实现', () => {
    for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(featureIsImplemented(key)).toBe(false);
    }
  });

  it('展示名是中文；未知 key 走兜底名而不回显协议原文', () => {
    expect(featureLabelOf('farm')).toBe('灵田');
    expect(featureLabelOf('pvp')).toBe('斗法');
    expect(featureLabelOf('unknown_system_x')).toBe('此地系统');
    expect(featureLabelOf('unknown_system_x')).not.toContain('unknown_system_x');
  });
});
