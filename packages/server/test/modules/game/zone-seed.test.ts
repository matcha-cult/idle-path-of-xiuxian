/**
 * §22 秘境种子不变量（纯配置 lint，不连数据库）。
 *
 * 为什么需要：`zones.json` 现在是**按境界分档的 13 条记录**，且带上了新语义
 * （`realm` / `tier_kind` / `unlock_item_code` / `idle_allowed`）。
 * 这些字段写错**不会在编译期暴露** —— 只会在玩家点「突破」时炸，或者更糟：
 * 悄悄给出一个不该能挂机的秘境、或一个打不通的秘境。
 *
 * 本文件是 `map-seed.test.ts` 的**对位物**：§22 把「秘境」从地图层搬到了这里，
 * 于是看守它的断言也跟着搬过来。
 *
 * 覆盖四类：
 * 1. **清单形状**：13 条、realm 1~13 唯一连续、id 与 orderIndex 对齐；
 * 2. **数值公式**：`base = 20×realm − 5` / `step = 12` / `层灵韵 = 2×realm` / 恒 3 层
 *    —— 这是 P3.0 实测过的 `zone_houshan`（4 境 = 75/87/99，灵韵 8）的推广，见 §22 §4.1；
 * 3. **两类秘境的分野**：training ⇒ 免费 ∧ 可挂机 ∧ realm ≤ 5；special ⇒ 需道具 ∧ 不可挂机；
 * 4. **引用完整性**：unit_code / boss_code 必须指向真实单位，且境界与 realm 一致。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SEED_DIR = new URL('../../../prisma/seeds/game/', import.meta.url);

interface ZoneSeed {
  id: number;
  code: string;
  name: string;
  realm: number;
  tierKind: string;
  orderIndex: number;
  unitCode: string;
  bossCode: string | null;
  basePower: number;
  powerStep: number;
  maxFloor: number;
  lingyunBonusPerFloor: number;
  bossEveryFloors: number;
  tierBonusEveryFloors: number;
  dropBonusEveryFloors: number;
  unlockItemCode: string | null;
  idleAllowed: boolean;
}

interface UnitSeed {
  code: string;
  name: string;
  realm: number;
  camp: string;
  baseStats: Record<string, number> | null;
}

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(new URL(file, SEED_DIR), 'utf8')) as T;
}

const zones = loadJson<ZoneSeed[]>('zones.json');
const units = loadJson<UnitSeed[]>('unit-templates.json');
const unitByCode = new Map(units.map((u) => [u.code, u]));

/** 免费历练秘境的上界（D10：青云宗把玩家历练到第五境）。 */
const TRAINING_MAX_REALM = 5;
/** 秘境覆盖的境界上界（14 境·合道留给下一张图 / 大世界之后）。 */
const MAX_ZONE_REALM = 13;

describe('§22 秘境清单形状', () => {
  test('恰好 13 个秘境（realm 1~13 各一个），code / id 都不重复', () => {
    assert.strictEqual(zones.length, MAX_ZONE_REALM, `秘境数应为 ${MAX_ZONE_REALM}`);
    assert.strictEqual(new Set(zones.map((z) => z.code)).size, zones.length, 'code 有重复');
    assert.strictEqual(new Set(zones.map((z) => z.id)).size, zones.length, 'id 有重复');
  });

  test('realm 恰好覆盖 1~13 且不重复（每境一个秘境，没有空档也不叠档）', () => {
    const realms = zones.map((z) => z.realm).sort((a, b) => a - b);
    assert.deepStrictEqual(
      realms,
      Array.from({ length: MAX_ZONE_REALM }, (_, i) => i + 1),
      'realm 必须是 1~13 的一个排列',
    );
  });

  test('id / orderIndex 与 realm 对齐（1-based，且不重复）—— 排序稳定，不依赖插入顺序', () => {
    const sorted = [...zones].sort((a, b) => a.realm - b.realm);
    sorted.forEach((z, i) => {
      assert.strictEqual(z.id, i + 1, `${z.code} 的 id 应与 realm 对齐`);
      assert.strictEqual(z.orderIndex, i + 1, `${z.code} 的 orderIndex 应与 realm 对齐`);
    });
  });

  test('code 命名规范：zone_r<realm>（漏改 code 会让 id 复用陷阱再次出现）', () => {
    for (const z of zones) {
      assert.strictEqual(z.code, `zone_r${z.realm}`, `${z.code} 不符合 zone_r<realm> 规范`);
    }
  });

  test('每个秘境都有非空中文名与风味（面板不会开天窗）', () => {
    for (const z of zones) {
      assert.ok(typeof z.name === 'string' && z.name.trim().length > 0, `${z.code} 缺 name`);
    }
  });
});

describe('§22 数值公式（P3.0 实测值的推广）', () => {
  test('base_power = 20×realm − 5；4 境必须正好是 P3.0 已实测的 75', () => {
    for (const z of zones) {
      assert.strictEqual(
        z.basePower,
        20 * z.realm - 5,
        `${z.code} 的 base_power 应为 ${20 * z.realm - 5}（实际 ${z.basePower}）`,
      );
    }
    // 这条是"公式没被误改"的锚点：它同时钉住了白板战力（realm×20）与那 5 点差值
    const r4 = zones.find((z) => z.realm === 4);
    assert.strictEqual(r4?.basePower, 75, '4 境首层必须是 75 —— 这是 P3.0 已实测的手感锚点');
  });

  test('power_step 恒为 12（唯一被实测过的值，§22 §10 Q9）', () => {
    for (const z of zones) {
      assert.strictEqual(z.powerStep, 12, `${z.code} 的 power_step 应为 12`);
    }
  });

  test('3 层门槛恰好是 base / base+12 / base+19+? —— 逐层 = base + (floor−1)×step', () => {
    for (const z of zones) {
      const ladders = [1, 2, 3].map((f) => z.basePower + (f - 1) * z.powerStep);
      assert.deepStrictEqual(
        ladders,
        [z.basePower, z.basePower + 12, z.basePower + 24],
        `${z.code} 的 3 层阶梯异常`,
      );
      // 4 境锚点：75 / 87 / 99
      if (z.realm === 4) assert.deepStrictEqual(ladders, [75, 87, 99]);
    }
  });

  test('层灵韵 = 2×realm；4 境必须正好是 P3.0 已实测的 8', () => {
    for (const z of zones) {
      assert.strictEqual(
        z.lingyunBonusPerFloor,
        2 * z.realm,
        `${z.code} 的层灵韵应为 ${2 * z.realm}`,
      );
    }
    assert.strictEqual(zones.find((z) => z.realm === 4)?.lingyunBonusPerFloor, 8);
  });

  test('全秘境恒 3 层，且第 3 层就是 Boss 层（§22 取代 D8 的「≤3 层」）', () => {
    for (const z of zones) {
      assert.strictEqual(z.maxFloor, 3, `${z.code} 应为 3 层`);
      assert.strictEqual(z.bossEveryFloors, 3, `${z.code} 的第 3 层必须是 Boss 层`);
    }
  });

  test('掉落深度加成不再是 0 之外的怪值（§22 统一 0 / 1）', () => {
    for (const z of zones) {
      assert.strictEqual(z.tierBonusEveryFloors, 0, `${z.code} 的 tier_bonus_every_floors 应为 0`);
      assert.strictEqual(z.dropBonusEveryFloors, 1, `${z.code} 的 drop_bonus_every_floors 应为 1`);
    }
  });
});

describe('§22 两类秘境的分野（用户 Q1 / Q5 / Q7）', () => {
  test('realm ≤ 5 必须是 training：免费、可挂机、无突破道具', () => {
    for (const z of zones.filter((x) => x.realm <= TRAINING_MAX_REALM)) {
      assert.strictEqual(z.tierKind, 'training', `${z.code}（realm ${z.realm}）应为历练秘境`);
      assert.strictEqual(z.idleAllowed, true, `${z.code} 是历练秘境，必须可挂机`);
      assert.strictEqual(z.unlockItemCode, null, `${z.code} 是免费秘境，不应有突破道具`);
    }
  });

  test('realm ≥ 6 必须是 special：需道具、不可挂机（用户 Q5「特殊秘境不能挂机」）', () => {
    for (const z of zones.filter((x) => x.realm > TRAINING_MAX_REALM)) {
      assert.strictEqual(z.tierKind, 'special', `${z.code}（realm ${z.realm}）应为特殊秘境`);
      assert.strictEqual(z.idleAllowed, false, `${z.code} 是特殊秘境，不得允许挂机`);
      assert.ok(
        typeof z.unlockItemCode === 'string' && z.unlockItemCode.length > 0,
        `${z.code} 是特殊秘境，必须声明突破道具`,
      );
    }
  });

  test('免费秘境恰好 5 个、特殊秘境恰好 8 个（D10 + §22 Q7）', () => {
    assert.strictEqual(zones.filter((z) => z.tierKind === 'training').length, TRAINING_MAX_REALM);
    assert.strictEqual(zones.filter((z) => z.tierKind === 'special').length, MAX_ZONE_REALM - TRAINING_MAX_REALM);
  });

  test('tierKind 只有 training / special 两种取值（不留下第三种半成品）', () => {
    for (const z of zones) {
      assert.ok(['training', 'special'].includes(z.tierKind), `${z.code} 的 tierKind 非法：${z.tierKind}`);
    }
  });

  test('「可挂机」与「免费」在数值上完全等价（唯一的两个挂机条件都必须成立）', () => {
    // idle_allowed 是独立列，但它在本轮**恰好**与 training 重合；
    // 若将来要放开"某个特殊秘境也能挂机"，这条会失败并提醒同步 UI 文案与 §22 §6.4。
    for (const z of zones) {
      assert.strictEqual(
        z.idleAllowed,
        z.tierKind === 'training',
        `${z.code}：idle_allowed 与 tierKind 的对应关系变了，请同步 §22 §6.4 与前端文案`,
      );
    }
  });

  test('突破道具 code 唯一（两个秘境共用一个道具会让「突破哪个」失去意义）', () => {
    const items = zones.map((z) => z.unlockItemCode).filter((c): c is string => c != null);
    assert.strictEqual(new Set(items).size, items.length, '突破道具 code 有重复');
  });
});

describe('§22 引用完整性（单位 / Boss）', () => {
  test('unit_code 与 boss_code 都指向真实单位，且阵营为敌对', () => {
    for (const z of zones) {
      const unit = unitByCode.get(z.unitCode);
      assert.ok(unit !== undefined, `${z.code} 引用不存在的单位 ${z.unitCode}`);
      assert.strictEqual(unit?.camp, 'hostile', `${z.code} 的刷怪单位不是敌对阵营`);
      assert.ok(z.bossCode != null, `${z.code} 未声明 bossCode`);
      const boss = unitByCode.get(z.bossCode ?? '');
      assert.ok(boss !== undefined, `${z.code} 引用不存在的 Boss ${z.bossCode}`);
      assert.strictEqual(boss?.camp, 'hostile', `${z.code} 的 Boss 不是敌对阵营`);
    }
  });

  test('刷怪单位与 Boss 的境界都必须等于该秘境的 realm（档位与内容不得错位）', () => {
    for (const z of zones) {
      assert.strictEqual(unitByCode.get(z.unitCode)?.realm, z.realm, `${z.code} 的刷怪境界与 realm 不一致`);
      assert.strictEqual(unitByCode.get(z.bossCode ?? '')?.realm, z.realm, `${z.code} 的 Boss 境界与 realm 不一致`);
    }
  });

  test('Boss 必须比同境杂兵强（baseStats 的 hp 至少是杂兵的 1 倍以上；杂兵 baseStats 为 null 时跳过）', () => {
    for (const z of zones) {
      const unit = unitByCode.get(z.unitCode);
      const boss = unitByCode.get(z.bossCode ?? '');
      if (unit?.baseStats == null || boss?.baseStats == null) continue; // 用境界模板生成的单位，无显式 baseStats
      assert.ok(
        (boss.baseStats.hp ?? 0) > (unit.baseStats.hp ?? 0),
        `${z.code} 的 Boss（hp ${boss.baseStats.hp}）不比杂兵（hp ${unit.baseStats.hp}）强`,
      );
    }
  });

  test('Boss 必须声明 baseStats（否则第 3 层是个没有数值的空壳）', () => {
    for (const z of zones) {
      const boss = unitByCode.get(z.bossCode ?? '');
      assert.ok(boss?.baseStats != null, `${z.code} 的 Boss ${z.bossCode} 缺 baseStats`);
      for (const key of ['hp', 'atk', 'def', 'spiritPower']) {
        assert.ok(
          Number.isFinite(boss?.baseStats?.[key]) && (boss?.baseStats?.[key] ?? 0) > 0,
          `${z.code} 的 Boss 缺 ${key} 或非正数`,
        );
      }
    }
  });

  test('同一境界内刷怪单位不得重复（13 个秘境应各有各的怪）', () => {
    const codes = zones.map((z) => z.unitCode);
    assert.strictEqual(new Set(codes).size, codes.length, '有秘境共用了同一个刷怪单位');
  });
});
