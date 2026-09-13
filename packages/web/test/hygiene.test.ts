// @vitest-environment node
/**
 * web 源码红线门禁（规划 09 §6.3）。
 *
 * 与 `ui-kit/test/hygiene.test.ts` 同一目的：把「注释里的纪律」变成可执行门禁。
 * 这里用**棘轮（ratchet）**处理历史遗留：遗留文件登记在上限表里，只能变小不能变大；
 * 文件被 M3 删除后，登记项必须一并删掉（否则本测试失败）。
 *
 * 规则：
 * 1. 颜色不得内联 hex（`var(--x, #hex)` 兜底写法除外 —— 那是 CSS 变量缺省值语法）；
 * 2. 不得使用 `!important`；
 * 3. 不得在组件里注入 `<style>`；
 * 4. 不得使用 antd 静态反馈 API（`Modal.confirm` / `message.*` / `notification.*`）；
 * 5. 单文件 ≤200 行（store 与常量表按规划豁免；遗留大文件走棘轮）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = fileURLToPath(new URL('../src', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const ALL = walk(SRC_ROOT)
  .map((f) => relative(SRC_ROOT, f).split(sep).join('/'))
  .filter((f) => !/\.test\.tsx?$/.test(f));
const read = (f: string): string => readFileSync(join(SRC_ROOT, f), 'utf8');
const lines = (f: string): number => read(f).split('\n').length;

/** CSS 变量兜底写法 `var(--x, #hex)` 不是「硬编码色」，扫描前剔除。 */
function stripCssVarFallbacks(code: string): string {
  return code.replace(/var\(\s*--[\w-]+\s*,[^)]*\)/g, 'var(--x)');
}

/** 遗留文件棘轮：只能缩小，不能增大；文件消失后必须从表中删除。 */
const LEGACY_LARGE_FILES: Record<string, number> = {
  // M3 将拆成 pages/game/panels/* + panel-registry（规划 09 §3 T-E）
  'pages/GamePanelPage.tsx': 756,
  // M2/M3 把页面迁到 antd 组件后，这里应大幅缩小到「只剩布局胶水」
  'styles.css': 457,
};

/** 遗留内联色：M3 重写该文件时必须一并移除本项。 */
const LEGACY_INLINE_HEX_FILES = new Set(['pages/GamePanelPage.tsx']);

/** 规模规则豁免（规划 09 §6.3 规则 1：store / 常量表例外）。路径相对 src。 */
const LENGTH_EXEMPT = [/^stores\//, /^app\/root-store\.ts$/, /^theme\//];

describe('红线 1 · 颜色不得内联 hex', () => {
  const HEX = /#[0-9a-fA-F]{3,8}\b/;

  it('仅登记在棘轮表中的遗留文件允许内联 hex', () => {
    const offenders = ALL.filter(
      (f) => HEX.test(stripCssVarFallbacks(read(f))) && !LEGACY_INLINE_HEX_FILES.has(f),
    );
    expect(offenders).toEqual([]);
  });

  it('棘轮表里的文件确实存在（M3 删除后必须清空该表）', () => {
    for (const f of LEGACY_INLINE_HEX_FILES) expect(ALL).toContain(f);
  });
});

describe('红线 2/3/4 · 样式与反馈 API 纪律', () => {
  it('不得使用 !important', () => {
    expect(ALL.filter((f) => read(f).includes('!important'))).toEqual([]);
  });

  it('不得在组件里注入 <style>', () => {
    expect(ALL.filter((f) => /<style[\s>]/.test(read(f)))).toEqual([]);
  });

  it('不得使用 antd 静态反馈 API（须走 App.useApp()）', () => {
    const STATIC_API = /\b(?:Modal\.(?:confirm|info|success|error|warning)|message\.(?:success|error|info|warning|loading)|notification\.(?:success|error|info|warning|open))\s*\(/;
    expect(ALL.filter((f) => STATIC_API.test(read(f)))).toEqual([]);
  });
});

describe('红线 5 · 单文件规模', () => {
  it('非豁免文件 ≤200 行', () => {
    const tooLong = ALL.filter(
      (f) =>
        !LENGTH_EXEMPT.some((re) => re.test(f)) &&
        !(f in LEGACY_LARGE_FILES) &&
        lines(f) > 200,
    ).map((f) => `${f}:${lines(f)}`);
    expect(tooLong).toEqual([]);
  });

  it('遗留大文件只允许缩小（棘轮）', () => {
    const oversize: string[] = [];
    for (const [file, max] of Object.entries(LEGACY_LARGE_FILES)) {
      expect(ALL, `棘轮表登记的 ${file} 已不存在，请从表中删除`).toContain(file);
      const actual = lines(file);
      if (actual > max) oversize.push(`${file}: ${actual} > ${max}`);
    }
    expect(oversize).toEqual([]);
  });
});
