/**
 * ⚠️ 临时方案登记门禁 —— `TEMPORARY-OFFLINE-IDLE`（挂机「离线时间兑产出」）
 *
 * 背景（用户 2026-09-14 定调 / 2026-09-15 复核）：
 * - 当前的挂机 = **离线时间 × 效率 → 一次结算**，用户已确认「**符合最低预期，作为临时方案接受**」；
 * - **终态**是**战斗逻辑服**在服务端**实时**推进挂机战斗 —— 原因：组队开战后无法保证队员
 *   全程在线，战斗必须与"谁在线"解耦。该系统是全游戏最复杂的逻辑服之一，需**单独立项**。
 * - 因此这座临时实现必须**一眼可辨**，否则后来者会把它当终态继续加码投入。
 *
 * 本测试把「注释里的纪律」变成可执行门禁（与 ui-kit / web 的 `hygiene.test.ts` 同一套路）：
 * 1. **权威登记表**就在下面的 `TEMPORARY_FILES`：只有它列出的文件可以带该标记；
 * 2. 表内文件必须存在、必须带标记、必须指回权威文档 —— 删标记 / 删文件都会变红；
 * 3. 全仓 `packages/<pkg>/src` 扫描：**带该标记的文件集合必须恰好等于登记表**（双向防漂移），
 *    新写一个"临时挂机"文件而不登记、或把标记抄到不相干的文件上，都会变红；
 * 4. 文档侧反向校验：`23-挂机开发交接.md` §0.1 必须逐条列出登记表里的每个路径。
 *
 * 终态落地时该怎么做：把临时实现整体换成战斗逻辑服 → 删除 `TEMPORARY_FILES` 里已消失的条目
 * → 删掉这些文件里的标记 → 更新 §0.1 的「已退出」记录 → 本测试自然保持绿色。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const TAG = 'TEMPORARY-OFFLINE-IDLE';
const DOC = 'ai-docs/frontend-solution-exploration/23-挂机开发交接.md';
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');

/**
 * **权威登记表**：属于「离线时间兑产出」临时实现的文件（路径相对仓库根）。
 *
 * `note` 说明该文件里**哪一部分**是临时的 —— 有的文件整体临时（如 idle 域），
 * 有的只临时一小段（如 `zone.service.ts` 只有 `idlePlan`）。
 */
const TEMPORARY_FILES: ReadonlyArray<{ file: string; note: string }> = [
  {
    file: 'packages/server/src/modules/logic/idle/internal/idle.service.ts',
    note: '整体临时：status / settle 两个 Action 的离线时间兑产出',
  },
  {
    file: 'packages/server/src/modules/logic/idle/internal/idle-settlement.ts',
    note: '整体临时：按层均分击杀 + 逐层聚合',
  },
  {
    file: 'packages/server/src/modules/logic/zone/internal/zone.service.ts',
    note: '仅 `idlePlan` 方法与 `ZoneIdlePlan` 相关段落临时；本文件其余部分是秘境主轴正式实现',
  },
  {
    file: 'packages/ionet-transport/src/api/dto.ts',
    note: '仅 `idle.settle` 响应体那一段（`IdleSettleData` / `IdleFloorView` / `IdleSettleZoneView`）',
  },
  {
    file: 'packages/web/src/stores/idle-store.ts',
    note: '整体临时：`status` / `settle` / `autoSettle`',
  },
  {
    file: 'packages/web/src/pages/game/panels/idle/presentation.ts',
    note: '整体临时：离线结算体的文案翻译（`idleRuleEntries` / `idleSettle*` / `idleFloorEntries`）',
  },
  {
    file: 'packages/web/src/pages/game/panels/idle/SettlementDetail.tsx',
    note: '整体临时：逐层战果卡片',
  },
  {
    file: 'packages/web/src/pages/game/panels/IdlePanel.tsx',
    note: '仅「挂机」段（离线时长 / 预计收益 / 逐层结算 / B2）；「挂机点」段是长期实现',
  },
];

/**
 * **反向哨兵**：明确**不属于**临时方案的相邻实现（挂机点选择等长期基建）。
 *
 * 它们不该带标记 —— 若哪天有人把标记抄过来，说明"临时边界"被糊掉了，本测试要拦住。
 */
const DURABLE_FILES: readonly string[] = [
  'packages/web/src/pages/game/panels/zone/IdleTargetBar.tsx',
  'packages/web/src/pages/game/panels/zone/IdleTargetPicker.tsx',
  'packages/web/src/pages/game/panels/zone/IdleBlockedHint.tsx',
  'packages/server/src/modules/logic/zone/zone.api.ts',
];

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/** 递归收集 `packages/<pkg>/src` 下的全部文件（相对仓库根，posix 分隔符）。 */
function walkSources(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    const relative = prefix === '' ? entry : `${prefix}/${entry}`;
    return statSync(full).isDirectory() ? walkSources(full, relative) : [relative];
  });
}

function sourceFiles(): string[] {
  return readdirSync(PACKAGES_ROOT)
    .map((pkg) => ({ pkg, dir: join(PACKAGES_ROOT, pkg, 'src') }))
    .filter((entry) => existsSync(entry.dir))
    .flatMap((entry) => walkSources(entry.dir).map((file) => `packages/${entry.pkg}/src/${file}`));
}

describe('临时方案登记门禁 · TEMPORARY-OFFLINE-IDLE', () => {
  test('登记表本身合法：非空、路径唯一、每条都说明临时边界', () => {
    assert.ok(TEMPORARY_FILES.length > 0, '登记表不能为空（临时方案必须留痕）');
    const paths = TEMPORARY_FILES.map((entry) => entry.file);
    assert.equal(new Set(paths).size, paths.length, '登记表路径不能重复');
    for (const entry of TEMPORARY_FILES) {
      assert.ok(entry.file.length > 0, 'file 不能为空');
      assert.ok(entry.note.length > 0, `${entry.file} 必须说明哪一部分是临时的`);
      assert.ok(!entry.file.startsWith('/'), `${entry.file} 必须是相对仓库根的路径`);
    }
  });

  test('登记表内文件都存在，且都带标记 + 指回权威文档', () => {
    for (const entry of TEMPORARY_FILES) {
      const full = join(REPO_ROOT, entry.file);
      assert.ok(existsSync(full), `登记表里的文件不存在：${entry.file}（已删除？请更新登记表）`);
      const code = read(entry.file);
      assert.ok(code.includes(TAG), `${entry.file} 缺少标记 ${TAG}`);
      assert.ok(code.includes('临时方案'), `${entry.file} 缺少「临时方案」中文标注`);
      assert.ok(
        code.includes('23-挂机开发交接.md'),
        `${entry.file} 未指回权威文档（应有 23-挂机开发交接.md）`,
      );
    }
  });

  test('反向哨兵（长期实现）不得带临时标记', () => {
    for (const file of DURABLE_FILES) {
      assert.ok(existsSync(join(REPO_ROOT, file)), `哨兵文件不存在：${file}（已移动？请更新哨兵表）`);
      assert.ok(
        !read(file).includes(TAG),
        `${file} 属于长期实现，不应带 ${TAG}（临时边界被糊掉了）`,
      );
    }
  });

  test('双向防漂移：全仓 packages/<pkg>/src 里带该标记的文件集合恰等于登记表', () => {
    const registered = new Set(TEMPORARY_FILES.map((entry) => entry.file));
    const found = new Set(sourceFiles().filter((file) => read(file).includes(TAG)));
    const unregistered = [...found].filter((file) => !registered.has(file)).sort();
    assert.deepEqual(
      unregistered,
      [],
      '出现了未登记的临时方案文件：请登记到本测试的 TEMPORARY_FILES，或去掉标记',
    );
    const stale = [...registered].filter((file) => !found.has(file));
    // 表内文件的存在性与标记已在上一组用例断言；这里只兜「集合相等」的另一半
    assert.deepEqual(stale, []);
  });

  test('权威文档 §0.1 逐条列出登记表里的每个文件（文档侧反向校验）', () => {
    assert.ok(existsSync(join(REPO_ROOT, DOC)), `权威文档不存在：${DOC}`);
    const doc = read(DOC);
    assert.ok(doc.includes(TAG), `${DOC} 必须写明标记名 ${TAG}`);
    assert.ok(doc.includes('§0.1') || doc.includes('## 0.1'), `${DOC} 必须有 §0.1 临时方案标注`);
    for (const entry of TEMPORARY_FILES) {
      assert.ok(doc.includes(entry.file), `${DOC} §0.1 未列出临时文件：${entry.file}`);
    }
  });
});
