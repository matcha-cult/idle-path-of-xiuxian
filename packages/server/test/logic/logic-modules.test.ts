import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ItemLogicModule } from '../../src/modules/logic/item/item-logic.module.js';
import { ItemLogicService } from '../../src/modules/logic/item/item.logic.service.js';
import { ItemAction } from '../../src/modules/logic/item/item.action.js';
import { PropLogicModule } from '../../src/modules/logic/prop/prop-logic.module.js';
import { PropLogicService } from '../../src/modules/logic/prop/prop.logic.service.js';
import { PropAction } from '../../src/modules/logic/prop/prop.action.js';
import { EquipLogicModule } from '../../src/modules/logic/equip/equip-logic.module.js';
import { EquipLogicService } from '../../src/modules/logic/equip/equip.logic.service.js';
import { EquipAction } from '../../src/modules/logic/equip/equip.action.js';
import { SkillLogicModule } from '../../src/modules/logic/skill/skill-logic.module.js';
import { SkillLogicService } from '../../src/modules/logic/skill/skill.logic.service.js';
import { SkillAction } from '../../src/modules/logic/skill/skill.action.js';
import { EconomyLogicModule } from '../../src/modules/logic/economy/economy-logic.module.js';
import { EconomyLogicService } from '../../src/modules/logic/economy/economy.logic.service.js';
import { EconomyAction } from '../../src/modules/logic/economy/economy.action.js';
import { RealmLogicModule } from '../../src/modules/logic/realm/realm-logic.module.js';
import { RealmLogicService } from '../../src/modules/logic/realm/realm.logic.service.js';
import { RealmAction } from '../../src/modules/logic/realm/realm.action.js';
import { CombatLogicModule } from '../../src/modules/logic/combat/combat-logic.module.js';
import { CombatLogicService } from '../../src/modules/logic/combat/combat.logic.service.js';
import { CombatAction } from '../../src/modules/logic/combat/combat.action.js';
import { ZoneLogicModule } from '../../src/modules/logic/zone/zone-logic.module.js';
import { ZoneLogicService } from '../../src/modules/logic/zone/zone.logic.service.js';
import { ZoneAction } from '../../src/modules/logic/zone/zone.action.js';
import { MapLogicModule } from '../../src/modules/logic/map/map-logic.module.js';
import { MapLogicService } from '../../src/modules/logic/map/map.logic.service.js';
import { MapAction } from '../../src/modules/logic/map/map.action.js';
import { QuestLogicModule } from '../../src/modules/logic/quest/quest-logic.module.js';
import { QuestLogicService } from '../../src/modules/logic/quest/quest.logic.service.js';
import { QuestAction } from '../../src/modules/logic/quest/quest.action.js';
import { StoryLogicModule } from '../../src/modules/logic/story/story-logic.module.js';
import { StoryLogicService } from '../../src/modules/logic/story/story.logic.service.js';
import { StoryAction } from '../../src/modules/logic/story/story.action.js';
import { IdleLogicModule } from '../../src/modules/logic/idle/idle-logic.module.js';
import { IdleLogicService } from '../../src/modules/logic/idle/idle.logic.service.js';
import { IdleAction } from '../../src/modules/logic/idle/idle.action.js';

interface Spec {
  name: string;
  module: object;
  facade: object;
  action: object;
}

const SPECS: Spec[] = [
  { name: 'item', module: ItemLogicModule, facade: ItemLogicService, action: ItemAction },
  { name: 'prop', module: PropLogicModule, facade: PropLogicService, action: PropAction },
  { name: 'equip', module: EquipLogicModule, facade: EquipLogicService, action: EquipAction },
  { name: 'skill', module: SkillLogicModule, facade: SkillLogicService, action: SkillAction },
  { name: 'economy', module: EconomyLogicModule, facade: EconomyLogicService, action: EconomyAction },
  { name: 'realm', module: RealmLogicModule, facade: RealmLogicService, action: RealmAction },
  { name: 'combat', module: CombatLogicModule, facade: CombatLogicService, action: CombatAction },
  { name: 'zone', module: ZoneLogicModule, facade: ZoneLogicService, action: ZoneAction },
  { name: 'map', module: MapLogicModule, facade: MapLogicService, action: MapAction },
  { name: 'quest', module: QuestLogicModule, facade: QuestLogicService, action: QuestAction },
  { name: 'story', module: StoryLogicModule, facade: StoryLogicService, action: StoryAction },
  { name: 'idle', module: IdleLogicModule, facade: IdleLogicService, action: IdleAction },
];

function metadata(key: string, target: object): unknown[] {
  return (Reflect.getMetadata(key, target) as unknown[] | undefined) ?? [];
}

describe('逻辑服模块接线边界', () => {
  for (const spec of SPECS) {
    test(`${spec.name}: providers/exports 同时含门面与 Action`, () => {
      const providers = metadata('providers', spec.module);
      const exportsList = metadata('exports', spec.module);
      assert.ok(providers.includes(spec.facade), `${spec.name} providers 缺少门面`);
      assert.ok(providers.includes(spec.action), `${spec.name} providers 缺少 Action`);
      assert.ok(exportsList.includes(spec.facade), `${spec.name} exports 缺少门面`);
      assert.ok(exportsList.includes(spec.action), `${spec.name} exports 缺少 Action`);
    });

    test(`${spec.name}: 声明了 imports`, () => {
      const imports = metadata('imports', spec.module);
      assert.ok(imports.length >= 1, `${spec.name} 未声明 imports`);
    });
  }

  test('12 个逻辑服模块互不重复', () => {
    const names = new Set(SPECS.map((s) => s.name));
    assert.equal(names.size, 12);
  });
});
