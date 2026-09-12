/**
 * 逻辑服依赖 / 环检测（CI 用）
 *
 * 规则（对应 ai-docs/http-ws-logic-server-refactor-plan.md §3、§4.4）：
 * 1. 全 src 禁止循环依赖（任何环即失败）；
 * 2. 业务逻辑服的跨服依赖必须落在 DAG 允许的下层集合内：
 *      边方向固定为「上层 → 下层」，低层禁止 import 高层。
 * 3. 基础设施（common/ionet/edge/database/auth/health/character/stat）任意层可用。
 *
 * 逻辑服目录约定：src/modules/logic/<server>/ ；迁移期同时识别 src/modules/game/<dir>/。
 * 实现：用 TypeScript 的 preProcessFile 抽取 import，不依赖 dependency-cruiser/madge。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..', 'src');

/** 业务逻辑服 → 允许依赖的其它业务逻辑服（缺失即不允许） */
const ALLOWED_DEPS: Record<string, readonly string[]> = {
  item: [],
  prop: ['item'],
  equip: ['item'],
  skill: ['character'],
  economy: ['item', 'prop'],
  realm: ['character', 'prop'],
  combat: ['item', 'equip'],
  zone: ['combat', 'item', 'equip'],
  quest: ['zone', 'combat', 'item'],
  story: ['quest'],
  idle: ['item', 'equip', 'combat', 'zone'],
  character: [],
};

/** 业务逻辑服层级（仅用于报错信息） */
const LAYER: Record<string, string> = {
  item: 'L-1', character: 'L-1',
  prop: 'L0', equip: 'L0', skill: 'L0',
  economy: 'L1', realm: 'L1', combat: 'L1',
  zone: 'L2',
  quest: 'L3', story: 'L3',
  idle: 'L4',
};

/** 迁移期：src/modules/game/<dir> → 逻辑服名 */
const LEGACY_DIR: Record<string, string> = {
  item: 'item',
  currency: 'economy',
  realm: 'realm',
  skill: 'skill',
  unit: 'combat',
  zone: 'zone',
  quest: 'quest',
  story: 'story',
  idle: 'idle',
};

/** 基础设施：不参与跨服约束 */
const INFRA = new Set([
  'common', 'ionet', 'modules', 'database', 'auth', 'health', 'character', 'stat', 'edge',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** './x.js' → 实际 .ts 文件 */
function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base.replace(/\.js$/, '.ts'),
    base + '.ts',
    path.join(base, 'index.ts'),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function serverOf(file: string): string | null {
  const rel = path.relative(SRC, file).split(path.sep);
  if (rel[0] === 'modules' && rel[1] === 'logic' && rel[2]) return rel[2];
  if (rel[0] === 'modules' && rel[1] === 'game' && rel[2] && rel[3] !== undefined) {
    return LEGACY_DIR[rel[2]] ?? null;
  }
  return null;
}

const files = walk(SRC);
const graph = new Map<string, string[]>();
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const pre = ts.preProcessFile(text, true, false);
  const deps: string[] = [];
  for (const imp of pre.importedFiles) {
    const resolved = resolveImport(file, imp.fileName);
    if (resolved) deps.push(resolved);
  }
  graph.set(file, [...new Set(deps)]);
}

const errors: string[] = [];

// 1) 环检测（DFS 三色）
const WHITE = 0, GRAY = 1, BLACK = 2;
const color = new Map<string, number>(files.map((f) => [f, WHITE]));
const stack: string[] = [];
const reported = new Set<string>();
function dfs(node: string): void {
  color.set(node, GRAY);
  stack.push(node);
  for (const next of graph.get(node) ?? []) {
    if (color.get(next) === GRAY) {
      const idx = stack.indexOf(next);
      const cycle = stack.slice(idx).concat(next).map((f) => path.relative(SRC, f));
      const key = [...cycle].sort().join('|');
      if (!reported.has(key)) {
        reported.add(key);
        errors.push('循环依赖: ' + cycle.join(' → '));
      }
    } else if (color.get(next) === WHITE) {
      dfs(next);
    }
  }
  stack.pop();
  color.set(node, BLACK);
}
for (const f of files) if (color.get(f) === WHITE) dfs(f);

// 2) 逻辑服 DAG 约束
for (const [file, deps] of graph) {
  const from = serverOf(file);
  if (!from || INFRA.has(from)) continue;
  const allowed = ALLOWED_DEPS[from];
  if (!allowed) continue; // 未登记的逻辑服目录，跳过（新服需补 ALLOWED_DEPS）
  for (const dep of deps) {
    const to = serverOf(dep);
    if (!to || to === from) continue;
    if (INFRA.has(to)) continue;
    if (!allowed.includes(to)) {
      errors.push(
        `越层依赖: ${from}(${LAYER[from] ?? '?'}) → ${to}(${LAYER[to] ?? '?'}) 未在允许集合 [${allowed.join(', ') || '无'}]` +
        ` :: ${path.relative(SRC, file)} → ${path.relative(SRC, dep)}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('✗ 依赖检查失败：');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`✓ 依赖检查通过（${files.length} 个文件，无环、无越层依赖）`);
