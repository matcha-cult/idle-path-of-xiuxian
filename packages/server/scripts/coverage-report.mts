
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = 'src';
const TEST = 'test';

function walk(dir, out = []) {
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

// 提取测试里所有 '../../src/...' 或 '../src/...' 引用，归一为 src 相对路径
const referenced = new Set();
for (const m of testText.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
  const spec = m[1];
  const idx = spec.indexOf('src/');
  if (idx === -1) continue;
  const rel = spec.slice(idx).replace(/\.js$/, '.ts');
  referenced.add(rel);
}

const isWiring = (f) =>
  /\.module\.ts$/.test(f) || /(^|\/)main\.ts$/.test(f) || /(^|\/)app\.module\.ts$/.test(f);
const isTypesOnly = (f) => /\.types\.ts$/.test(f) || /(^|\/)notification\.port\.ts$/.test(f);

const uncovered = srcFiles.filter((f) => !referenced.has(f) && !isWiring(f) && !isTypesOnly(f));
const uncoveredWiring = srcFiles.filter((f) => isWiring(f) && !referenced.has(f));
const uncoveredTypes = srcFiles.filter((f) => isTypesOnly(f) && !referenced.has(f));

console.log('源文件总数:', srcFiles.length);
console.log('被测试引用的源文件:', [...referenced].filter((r) => srcFiles.includes(r)).length);
console.log('\n=== 未覆盖（业务逻辑） ===');
for (const f of uncovered) console.log('  ' + f);
console.log('\n=== 未覆盖（模块接线/入口，通常由 e2e 覆盖） ===');
for (const f of uncoveredWiring) console.log('  ' + f);
console.log('\n=== 未覆盖（纯类型/端口） ===');
for (const f of uncoveredTypes) console.log('  ' + f);
