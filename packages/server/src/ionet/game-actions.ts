/**
 * 逻辑服 Action 与模块清单（集中登记）
 *
 * 任务 4 之后不再需要 DI 桥接模块：`IonetModule.forRoot({ actions, resolveAction })`
 * 会在 `onModuleInit`（app 就绪后）经 `resolveAction` 从 NestJS 容器解析 Action 实例，
 * 因此 Action 类**必须是容器里的 provider**（由各自的逻辑服模块提供并导出）。
 *
 * 注意（框架作者提示，消费方已实证）：resolveAction 由应用侧显式实现（`app.get(Cls)`），
 * 不要依赖框架侧注入 @nestjs/core 类令牌——跨仓库 workspace 链接下可能多副本而静默为 undefined。
 */
import { HealthAction } from './health.action.js';
import { SystemLogicModule } from './system-logic.module.js';
import { ItemAction } from '../modules/logic/item/item.action.js';
import { PropAction } from '../modules/logic/prop/prop.action.js';
import { EquipAction } from '../modules/logic/equip/equip.action.js';
import { SkillAction } from '../modules/logic/skill/skill.action.js';
import { EconomyAction } from '../modules/logic/economy/economy.action.js';
import { RealmAction } from '../modules/logic/realm/realm.action.js';
import { CombatAction } from '../modules/logic/combat/combat.action.js';
import { ZoneAction } from '../modules/logic/zone/zone.action.js';
import { MapAction } from '../modules/logic/map/map.action.js';
import { QuestAction } from '../modules/logic/quest/quest.action.js';
import { StoryAction } from '../modules/logic/story/story.action.js';
import { IdleAction } from '../modules/logic/idle/idle.action.js';

import { ItemLogicModule } from '../modules/logic/item/item-logic.module.js';
import { PropLogicModule } from '../modules/logic/prop/prop-logic.module.js';
import { EquipLogicModule } from '../modules/logic/equip/equip-logic.module.js';
import { SkillLogicModule } from '../modules/logic/skill/skill-logic.module.js';
import { EconomyLogicModule } from '../modules/logic/economy/economy-logic.module.js';
import { RealmLogicModule } from '../modules/logic/realm/realm-logic.module.js';
import { CombatLogicModule } from '../modules/logic/combat/combat-logic.module.js';
import { ZoneLogicModule } from '../modules/logic/zone/zone-logic.module.js';
import { MapLogicModule } from '../modules/logic/map/map-logic.module.js';
import { QuestLogicModule } from '../modules/logic/quest/quest-logic.module.js';
import { StoryLogicModule } from '../modules/logic/story/story-logic.module.js';
import { IdleLogicModule } from '../modules/logic/idle/idle-logic.module.js';

/** 已登记的逻辑服 Action 类（按依赖层自底向上排列） */
export const GAME_ACTION_CLASSES = [
  HealthAction,   // system   cmd 1
  ItemAction,     // L-1      cmd 30
  PropAction,     // L0       cmd 40
  EquipAction,    // L0       cmd 50
  SkillAction,    // L0       cmd 60
  EconomyAction,  // L1       cmd 70
  RealmAction,    // L1       cmd 80
  CombatAction,   // L1       cmd 90
  ZoneAction,     // L2       cmd 100
  MapAction,      // L2       cmd 140
  QuestAction,    // L3       cmd 110
  StoryAction,    // L3       cmd 120
  IdleAction,     // L4       cmd 130
] as const;

/** 各逻辑服模块（提供并导出各自的 Action 与门面） */
export const GAME_LOGIC_MODULES = [
  SystemLogicModule,
  ItemLogicModule,
  PropLogicModule,
  EquipLogicModule,
  SkillLogicModule,
  EconomyLogicModule,
  RealmLogicModule,
  CombatLogicModule,
  ZoneLogicModule,
  MapLogicModule,
  QuestLogicModule,
  StoryLogicModule,
  IdleLogicModule,
] as const;

/**
 * InOut 插件（按数组顺序执行 fuckIn）。
 * 目前为空：鉴权已迁到 WS 握手鉴权；保留本机制供后续插件使用。
 */
export const GAME_INOUT_CLASSES = [] as const;
