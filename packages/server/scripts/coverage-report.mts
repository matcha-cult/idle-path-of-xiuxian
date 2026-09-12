/**
 * 覆盖缺口扫描：列出「源码文件」中未被任何测试 import 引用的部分。
 *
 * 判定为「已覆盖」= 至少一个 test 目录下的 .test.ts 通过相对路径 import 了它。
 * 模块接线（*.module.ts）与引导入口（main.ts）单独归类（由 e2e 覆盖）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = 'src';
const TEST = 'test';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(full.replace(/\\/g, '/'));
  }
  return out;
}

const srcFiles = walk(SRC);
const testFiles = walk(TEST);
const testText = testFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

const referenced = new Set<string>();
for (const match of testText.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
  const spec = match[1];
  const idx = spec.indexOf('src/');
  if (idx === -1) continue;
  referenced.add(spec.slice(idx).replace(/\.js$/, '.ts'));
}

const isWiring = (f: string): boolean =>
  /\.module\.ts$/.test(f) || /(^|\/)main\.ts$/.test(f) || /(^|\/)app\.module\.ts$/.test(f);
const isTypesOnly = (f: string): boolean => /\.types\.ts$/.test(f) || /(^|\/)notification\.port\.ts$/.test(f);

const covered = (f: string): boolean => referenced.has(f);
const business = srcFiles.filter((f) => !covered(f) && !isWiring(f) && !isTypesOnly(f));
const wiring = srcFiles.filter((f) => !covered(f) && isWiring(f));
const typesOnly = srcFiles.filter((f) => !covered(f) && isTypesOnly(f));

console.log('源文件总数:', srcFiles.length);
console.log('被测试引用的源文件:', srcFiles.filter(covered).length);
console.log('\n=== 未覆盖（业务逻辑） ===');
for (const f of business) console.log('  ' + f);
console.log('\n=== 未覆盖（模块接线/入口，通常由 e2e 覆盖） ===');
for (const f of wiring) console.log('  ' + f);
console.log('\n=== 未覆盖（纯类型/端口） ===');
for (const f of typesOnly) console.log('  ' + f);
