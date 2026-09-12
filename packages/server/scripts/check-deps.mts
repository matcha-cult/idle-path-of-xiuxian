/**
 * 逻辑服依赖 / 环检查（CI 用）——CLI 薄壳
 *
 * 规则实现见 scripts/lib/dep-rules.ts（可单元测试）。
 * 规则：1) 全 src 禁止循环依赖；2) 跨服依赖必须落在 DAG 允许的下层集合内；
 *       3) 禁止跨服直连对方 internal/（迁移期先作为警告输出）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph, findCycles, findInternalLeaks, findLayerViolations } from './lib/dep-rules.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..', 'src');

const graph = buildGraph(SRC);
const errors = [
  ...findCycles(graph).map((cycle) => '循环依赖: ' + cycle.join(' → ')),
  ...findLayerViolations(graph),
];
const leaks = findInternalLeaks(graph);

if (leaks.length > 0) {
  console.warn('⚠ 跨服直连 internal（待收敛，不阻塞）：');
  for (const leak of leaks) console.warn('  ' + leak);
}

if (errors.length > 0) {
  console.error('✗ 依赖检查失败：');
  for (const error of errors) console.error('  ' + error);
  process.exit(1);
}
console.log(`✓ 依赖检查通过（${graph.size} 个文件，无环、无越层依赖）` + (leaks.length ? `；${leaks.length} 处 internal 泄漏待收敛` : ''));
