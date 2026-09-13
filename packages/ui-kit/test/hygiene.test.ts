// @vitest-environment node
// 说明：本文件用 node:fs 扫描源码，必须在 Node 环境运行；
// jsdom 下 import.meta.url 不是 file: URL，`new URL(..., import.meta.url)` 会抛 ERR_INVALID_URL_SCHEME。
/**
 * ui-kit 源码红线门禁（规划 09 §6.3）。
 *
 * 这些规则刻意做成**可执行测试**而不是文档/注释里的纪律 —— 参考项目（stock-sim）的教训是
 * 「注释里写规则，同文件就违反」。任何违规都在 `pnpm test` 阶段失败。
 *
 * 规则：
 * 1. 不得依赖业务包 / mobx / node 内置（保证「可通用」，编译期 + 测试双层）；
 * 2. 颜色不得内联 hex（唯一例外：`src/theme/types.ts` 的主题色常量）；
 * 3. 不得使用 `!important`；
 * 4. 不得在组件里注入 `<style>`；
 * 5. 不得使用 antd 静态反馈 API（`Modal.confirm` / `message.*` / `notification.*`）——
 *    静态调用会脱离 ConfigProvider 上下文，导致主题与 locale 失效；
 * 6. 每个组件目录必须有同目录测试；
 * 7. 一个 `.tsx` 文件只导出一个组件；
 * 8. 单文件 ≤200 行。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = fileURLToPath(new URL('../src', import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const ALL_FILES = walk(SRC_ROOT).map((f) => relative(SRC_ROOT, f));
const REL = (f: string): string => f.split(sep).join('/');
const ALL = ALL_FILES.map(REL);
const SOURCE = ALL.filter((f) => !/\.test\.tsx?$/.test(f));
/**
 * 代码文件 = 源码去掉「纯文档」的根 barrel。
 * `src/index.ts` 只有 re-export 与说明性注释，注释里会合法地提到 `!important` / `<style>`
 * 这类被禁用法，因此字符串扫描（规则 2/3/4/5）必须把它排除；import 与结构规则仍覆盖全量。
 */
const CODE = SOURCE.filter((f) => f !== 'index.ts');
const TSX = SOURCE.filter((f) => f.endsWith('.tsx'));
const read = (f: string): string => readFileSync(join(SRC_ROOT, f), 'utf8');
const lines = (f: string): number => read(f).split('\n').length;

/** 颜色唯一例外：主题色常量所在文件（规划 09 §2.1 D3 指定的「唯一常量处」）。 */
const HEX_ALLOWED_FILES = ['theme/types.ts'];

describe('红线 1 · 不得依赖业务包 / mobx / node 内置', () => {
  const FORBIDDEN = /(?:from|import)\s*\(?\s*['"](@idle-path\/|mobx|node:)/;

  it('src 下无任何违规 import', () => {
    const offenders = SOURCE.filter((f) => FORBIDDEN.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('package.json 未声明这些依赖（依赖侧也堵死）', () => {
    const pkg = JSON.parse(readFileSync(join(SRC_ROOT, '..', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const declared = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})];
    expect(declared.filter((d) => d.startsWith('@idle-path/') || d === 'mobx')).toEqual([]);
  });
});

describe('红线 2 · 颜色不得内联 hex', () => {
  const HEX = /#[0-9a-fA-F]{3,8}\b/;

  it('只有主题色常量文件允许出现 hex', () => {
    const offenders = CODE.filter((f) => HEX.test(read(f)) && !HEX_ALLOWED_FILES.includes(f));
    expect(offenders).toEqual([]);
  });

  it('主题色常量确实存在于唯一例外文件中', () => {
    const hexLines = read('theme/types.ts')
      .split('\n')
      .filter((l) => HEX.test(l));
    expect(hexLines).toHaveLength(1);
    expect(hexLines[0]).toContain('DEFAULT_PRIMARY_COLOR');
  });
});

describe('红线 3/4/5 · 样式与反馈 API 纪律', () => {
  it('不得使用 !important', () => {
    expect(CODE.filter((f) => read(f).includes('!important'))).toEqual([]);
  });

  it('不得在组件里注入 <style>', () => {
    expect(CODE.filter((f) => /<style[\s>]/.test(read(f)))).toEqual([]);
  });

  it('不得使用 antd 静态反馈 API（须走 App.useApp()）', () => {
    // 精确判定：从 antd **静态导入** `message`/`notification`（或调用 `Modal.confirm` 等静态方法）
    // 才会脱离 ConfigProvider 上下文。经 `App.useApp()` 解构得到的实例不算违规
    // （例如容器组件里的 `const { message } = App.useApp();`）。
    const STATIC_IMPORT = /import\s*\{[^}]*\b(?:message|notification)\b[^}]*\}\s*from\s*['"]antd['"]/;
    const MODAL_STATIC = /\bModal\.(?:confirm|info|success|error|warning)\s*\(/;
    const offenders = CODE.filter((f) => {
      const code = read(f);
      return MODAL_STATIC.test(code) || STATIC_IMPORT.test(code);
    });
    expect(offenders).toEqual([]);
  });
});

describe('红线 6/7/8 · 结构与规模', () => {
  it('每个组件目录都有同目录测试', () => {
    const componentFiles = TSX.filter((f) => f.endsWith('/index.tsx'));
    const missing = componentFiles.filter((f) => !ALL.includes(f.replace(/index\.tsx$/, 'index.test.tsx')));
    expect(missing).toEqual([]);
    expect(componentFiles.length).toBeGreaterThan(0);
  });

  it('一个 .tsx 文件只导出一个组件（常量/类型不受限）', () => {
    // 只统计「组件函数」。域常量（如 RARITY_LABELS）与 props 类型可以同时导出，
    // 它们不是组件，不违反「一文件一组件」。
    const multi = TSX.filter((f) => (read(f).match(/^export function [A-Z]\w*/gm) ?? []).length > 1);
    expect(multi).toEqual([]);
  });

  it('组件统一具名导出，不得使用 export default', () => {
    expect(SOURCE.filter((f) => /^export default/m.test(read(f)))).toEqual([]);
  });

  it('单文件 ≤200 行', () => {
    const tooLong = SOURCE.filter((f) => lines(f) > 200).map((f) => `${f}:${lines(f)}`);
    expect(tooLong).toEqual([]);
  });
});
