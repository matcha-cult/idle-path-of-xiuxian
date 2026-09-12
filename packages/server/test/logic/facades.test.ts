import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ItemLogicService } from '../../src/modules/logic/item/item.logic.service.js';
import { PropLogicService } from '../../src/modules/logic/prop/prop.logic.service.js';
import { EquipLogicService } from '../../src/modules/logic/equip/equip.logic.service.js';
import { SkillLogicService } from '../../src/modules/logic/skill/skill.logic.service.js';
import { EconomyLogicService } from '../../src/modules/logic/economy/economy.logic.service.js';
import { RealmLogicService } from '../../src/modules/logic/realm/realm.logic.service.js';
import { CombatLogicService } from '../../src/modules/logic/combat/combat.logic.service.js';
import { ZoneLogicService } from '../../src/modules/logic/zone/zone.logic.service.js';
import { QuestLogicService } from '../../src/modules/logic/quest/quest.logic.service.js';
import { StoryLogicService } from '../../src/modules/logic/story/story.logic.service.js';
import { IdleLogicService } from '../../src/modules/logic/idle/idle.logic.service.js';
import { stub } from '../helpers/stub.js';

describe('ItemLogicService 转发边界', () => {
  test('全部方法透传实参', async () => {
    const item = {
      inventory: stub(() => 'a'), detail: stub(() => 'b'), bases: stub(() => 'c'),
      listPickupRules: stub(() => 'd'), createPickupRule: stub(() => 'e'),
      updatePickupRule: stub(() => 'f'), deletePickupRule: stub(() => 'g'),
      discard: stub(() => 'h'), generateItemForUser: stub(() => 'i'), equip: stub(() => 'j'),
      unequip: stub(() => 'k'), equipment: stub(() => 'l'),
    };
    const svc = new ItemLogicService(item as never);
    assert.equal(await svc.inventory(1, { page: 2 }), 'a');
    assert.equal(await svc.detail(1, 2), 'b');
    assert.equal(await svc.bases({ page: 1 }), 'c');
    assert.equal(await svc.listPickupRules(1), 'd');
    assert.equal(await svc.createPickupRule(1, { name: 'n' }), 'e');
    assert.equal(await svc.updatePickupRule(1, 2, { name: 'n' }), 'f');
    assert.equal(await svc.deletePickupRule(1, 2), 'g');
    assert.equal(await svc.discard(1, 2), 'h');
    assert.equal(await svc.generate(1, 2, 3, 4), 'i');
    assert.equal(await svc.equip(1, 2), 'j');
    assert.equal(await svc.unequip(1, 2), 'k');
    assert.equal(await svc.equipment(1), 'l');
    assert.deepEqual(item.generateItemForUser.last, [1, 2, 3, 4]);
    assert.deepEqual(item.equipment.last, [1]);
  });
});

describe('PropLogicService / EquipLogicService 依赖 item 门面', () => {
  test('prop 只经 item 门面操作', async () => {
    const item = { discard: stub(() => 'D'), generate: stub(() => 'G') };
    const svc = new PropLogicService(item as never);
    assert.equal(await svc.discard(1, 2), 'D');
    assert.equal(await svc.generate(1, 2, 0, null), 'G');
    assert.deepEqual(item.discard.last, [1, 2]);
    assert.deepEqual(item.generate.last, [1, 2, 0, null]);
  });
  test('equip 只经 item 门面操作', async () => {
    const item = { equip: stub(() => 'E'), unequip: stub(() => 'U'), equipment: stub(() => 'Q') };
    const svc = new EquipLogicService(item as never);
    assert.equal(await svc.equip(1, 2), 'E');
    assert.equal(await svc.unequip(1, 2), 'U');
    assert.equal(await svc.equipment(1), 'Q');
  });
});

describe('SkillLogicService 转发边界', () => {
  test('7 个方法全部透传', async () => {
    const skill = {
      catalog: stub(() => 1), learn: stub(() => 2), getPanel: stub(() => 3),
      putPanel: stub(() => 4), enlighten: stub(() => 5), grantLingyun: stub(() => 6), grantJade: stub(() => 7),
    };
    const svc = new SkillLogicService(skill as never);
    assert.equal(await svc.catalog(1), 1);
    assert.equal(await svc.learn(1, 2), 2);
    assert.equal(await svc.getPanel(1), 3);
    assert.equal(await svc.putPanel(1, { x: 1 }), 4);
    assert.equal(await svc.enlighten(1, 2), 5);
    assert.equal(await svc.grantLingyun(1, 100), 6);
    assert.equal(await svc.grantJade(1, 3), 7);
    assert.deepEqual(skill.putPanel.last, [1, { x: 1 }]);
  });
});

describe('EconomyLogicService 转发边界', () => {
  test('通货与炼器分别走对应服务', async () => {
    const currency = {
      catalog: stub(() => 'cur'), grant: stub(() => 'grant'),
      catalogEssences: stub(() => 'ess'), grantEssence: stub(() => 'grantEss'),
    };
    const craft = { craft: stub(() => 'craft') };
    const svc = new EconomyLogicService(currency as never, craft as never);
    assert.equal(await svc.currencies(1), 'cur');
    assert.equal(await svc.grantCurrency(1, 'c', 2), 'grant');
    assert.equal(await svc.essences(1), 'ess');
    assert.equal(await svc.grantEssence(1, 'c', 2), 'grantEss');
    assert.equal(await svc.craft(1, 2, 'op', 'extra'), 'craft');
    assert.deepEqual(craft.craft.last, [1, 2, 'op', 'extra']);
  });
});

describe('RealmLogicService / CombatLogicService 转发边界', () => {
  test('realm', async () => {
    const realm = { status: stub(() => 'S'), breakthrough: stub(() => 'B') };
    const svc = new RealmLogicService(realm as never);
    assert.equal(await svc.status(1), 'S');
    assert.equal(await svc.breakthrough(1), 'B');
  });
  test('combat', async () => {
    const unit = { catalog: stub(() => 'C'), dropTables: stub(() => 'D'), spawn: stub(() => 'S'), kill: stub(() => 'K') };
    const svc = new CombatLogicService(unit as never);
    assert.equal(await svc.catalog(1, { realm: 2, camp: 'hostile' }), 'C');
    assert.equal(await svc.dropTables(1), 'D');
    assert.equal(await svc.spawn(1, 'code', 3), 'S');
    assert.equal(await svc.kill(1, 'code', 5), 'K');
    assert.deepEqual(unit.catalog.last, [1, { realm: 2, camp: 'hostile' }]);
  });
});

describe('ZoneLogicService / QuestLogicService / StoryLogicService / IdleLogicService 转发边界', () => {
  test('zone', async () => {
    const zone = { catalog: stub(() => 'C'), progress: stub(() => 'P'), enter: stub(() => 'E'), challenge: stub(() => 'H') };
    const svc = new ZoneLogicService(zone as never);
    assert.equal(await svc.catalog(1), 'C');
    assert.equal(await svc.progress(1), 'P');
    assert.equal(await svc.enter(1, 'z'), 'E');
    assert.equal(await svc.challenge(1, 'z'), 'H');
    assert.deepEqual(zone.challenge.last, [1, 'z']);
  });
  test('quest（含章节并入）', async () => {
    const quest = { list: stub(() => 1), detail: stub(() => 2), sync: stub(() => 3) };
    const chapter = { list: stub(() => 4), detail: stub(() => 5), sync: stub(() => 6) };
    const svc = new QuestLogicService(quest as never, chapter as never);
    assert.equal(await svc.list(1), 1);
    assert.equal(await svc.detail(1, 'c'), 2);
    assert.equal(await svc.sync(1), 3);
    assert.equal(await svc.chapterList(1), 4);
    assert.equal(await svc.chapterDetail(1, '1'), 5);
    assert.equal(await svc.chapterSync(1), 6);
  });
  test('story', async () => {
    const story = { chapterStory: stub(() => 'A'), questStory: stub(() => 'B'), markSeen: stub(() => 'C') };
    const svc = new StoryLogicService(story as never);
    assert.equal(await svc.chapterStory(1, '1'), 'A');
    assert.equal(await svc.questStory(1, 'q'), 'B');
    assert.equal(await svc.markSeen(1, 'k'), 'C');
  });
  test('idle', async () => {
    const idle = { status: stub(() => 'S'), settle: stub(() => 'T') };
    const svc = new IdleLogicService(idle as never);
    assert.equal(await svc.status(1), 'S');
    assert.equal(await svc.settle(1, 'u', 3), 'T');
    assert.deepEqual(idle.settle.last, [1, 'u', 3]);
  });
});
