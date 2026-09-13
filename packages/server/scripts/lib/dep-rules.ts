/**
 * 逻辑服依赖规则（可测试的纯逻辑）
 *
 * 与 scripts/check-deps.mts 共用：规则本身不依赖文件系统，
 * buildGraph() 才读取源码；便于单元测试用合成图直接验证规则。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** 业务逻辑服 → 允许依赖的其它业务逻辑服（缺失即不允许） */
export const ALLOWED_DEPS: Record<string, readonly string[]> = {
  item: [],
  prop: ['item'],
  equip: ['item'],
  skill: ['character'],
  economy: ['item', 'prop'],
  realm: ['character', 'prop'],
  combat: ['item', 'equip'],
  zone: ['combat', 'item', 'equip', 'map'],
  quest: ['zone', 'combat', 'item'],
  story: ['quest'],
  idle: ['item', 'equip', 'combat', 'zone', 'map'],
  map: [],
  character: [],
};

/** 逻辑服层级（仅用于报错信息） */
export const LAYER: Record<string, string> = {
  item: 'L-1', character: 'L-1',
  prop: 'L0', equip: 'L0', skill: 'L0',
  economy: 'L1', realm: 'L1', combat: 'L1',
  zone: 'L2', map: 'L2',
  quest: 'L3', story: 'L3',
  idle: 'L4',
};

/** 迁移期：src/modules/game/<dir> → 逻辑服名 */
export const LEGACY_DIR: Record<string, string> = {
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
export const INFRA = new Set([
  'common', 'ionet', 'modules', 'database', 'auth', 'health', 'character', 'stat', 'edge',
]);

/** 相对 src 的 POSIX 路径 → 逻辑服名；基础设施/未知 → null */
export function serverOf(relPath: string): string | null {
  const parts = relPath.split('/');
  if (parts[0] === 'modules' && parts[1] === 'logic' && parts[2]) return parts[2];
  if (parts[0] === 'modules' && parts[1] === 'game' && parts[2] && parts[3] !== undefined) {
    return LEGACY_DIR[parts[2]] ?? null;
  }
  return null;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function resolveImport(fromAbs: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromAbs), spec);
  const candidates = [base.replace(/\.js$/, '.ts'), base + '.ts', path.join(base, 'index.ts')];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** 构建相对依赖图：键与值均为相对 srcDir 的 POSIX 路径 */
export function buildGraph(srcDir: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const abs of walk(srcDir)) {
    const rel = path.relative(srcDir, abs).split(path.sep).join('/');
    const pre = ts.preProcessFile(readFileSync(abs, 'utf8'), true, false);
    const deps = new Set<string>();
    for (const imp of pre.importedFiles) {
      const resolved = resolveImport(abs, imp.fileName);
      if (resolved) deps.add(path.relative(srcDir, resolved).split(path.sep).join('/'));
    }
    graph.set(rel, [...deps]);
  }
  return graph;
}

/** 三色 DFS 找环，返回去重后的环（节点用相对路径表示） */
export function findCycles(graph: Map<string, string[]>): string[][] {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const node of graph.keys()) color.set(node, WHITE);
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seen = new Set<string>();

  const visit = (node: string): void => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const state = color.get(next) ?? WHITE;
      if (state === GRAY) {
        const idx = stack.indexOf(next);
        const cycle = stack.slice(idx).concat(next);
        const key = [...new Set(cycle)].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      } else if (state === WHITE) {
        visit(next);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  };

  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) visit(node);
  }
  return cycles;
}

/** 越层依赖（低层 import 高层 / 未允许的跨服依赖） */
export function findLayerViolations(graph: Map<string, string[]>): string[] {
  const violations: string[] = [];
  for (const [file, deps] of graph) {
    const from = serverOf(file);
    if (!from || INFRA.has(from)) continue;
    const allowed = ALLOWED_DEPS[from];
    if (!allowed) continue;
    for (const dep of deps) {
      const to = serverOf(dep);
      if (!to || to === from || INFRA.has(to)) continue;
      if (!allowed.includes(to)) {
        violations.push(
          `越层依赖: ${from}(${LAYER[from] ?? '?'}) → ${to}(${LAYER[to] ?? '?'}) 未在允许集合 [${allowed.join(', ') || '无'}] :: ${file} → ${dep}`,
        );
      }
    }
  }
  return violations;
}

/**
 * 跨服直连 internal 泄漏：其它逻辑服 import 了本服 internal/ 下的实现文件。
 * 允许的跨服访问只有对方门面（<server>.logic.service.ts）与公开类型（<server>.api.ts）。
 * 迁移完成前作为「待收敛」警告，不阻塞构建。
 */
export function findInternalLeaks(graph: Map<string, string[]>): string[] {
  const leaks: string[] = [];
  for (const [file, deps] of graph) {
    const from = serverOf(file);
    if (!from || INFRA.has(from)) continue;
    for (const dep of deps) {
      if (!dep.includes('/internal/')) continue;
      const to = serverOf(dep);
      if (!to || to === from || INFRA.has(to)) continue;
      leaks.push(`${from} → ${to} :: ${file} → ${dep}`);
    }
  }
  return leaks;
}
