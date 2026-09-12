/**
 * Action ↔ NestJS DI 桥接模块
 *
 * 问题：ionet 的 BarSkeleton.addAction(ActionClass) 不传 instance 时会直接
 * new ActionClass()，Action 拿不到 NestJS 容器里的服务（无 DI）。
 *
 * 方案（Track A，不改 vendor）：
 * 1. 各逻辑服 Action 标 @Injectable()，在其逻辑服模块登记为 provider 并导出；
 * 2. IonetModule.forRoot({ actions: [] }) 构建空骨架；
 * 3. 本模块用「应用内工厂令牌」把 Action 实例收集成数组，在 onModuleInit
 *    （早于 app.listen）逐个 skeleton.addAction(ActionClass, instance)，并挂载 InOut；
 * 4. 注册完毕后做一次全局重复路由断言（同一 cmd/subCmd 只能有一个 Action）。
 *
 * 为什么不用 ModuleRef：跨 workspace（pnpm workspace:*）下 @nestjs/core 可能
 * 存在多份物理副本，框架侧注入的类令牌会静默降级为 undefined（已实证）。
 * 这里只用本模块自己声明的 Symbol/类 provider 令牌，不跨副本。
 *
 * 新增逻辑服：把 Action 类加进 GAME_ACTION_CLASSES、逻辑服模块加进 imports。
 */
import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { type ActionMethodInOut, type BarSkeleton } from '@nbb-ionet/core-framework';
import { IONET_BAR_SKELETON } from '@nbb-ionet/extension-nestjs';
import { AuthModule } from '../modules/auth/auth.module.js';
import { ItemLogicModule } from '../modules/logic/item/item-logic.module.js';
import { ItemAction } from '../modules/logic/item/item.action.js';
import { PropLogicModule } from '../modules/logic/prop/prop-logic.module.js';
import { PropAction } from '../modules/logic/prop/prop.action.js';
import { EquipLogicModule } from '../modules/logic/equip/equip-logic.module.js';
import { EquipAction } from '../modules/logic/equip/equip.action.js';
import { SkillLogicModule } from '../modules/logic/skill/skill-logic.module.js';
import { SkillAction } from '../modules/logic/skill/skill.action.js';
import { EconomyLogicModule } from '../modules/logic/economy/economy-logic.module.js';
import { EconomyAction } from '../modules/logic/economy/economy.action.js';
import { RealmLogicModule } from '../modules/logic/realm/realm-logic.module.js';
import { RealmAction } from '../modules/logic/realm/realm.action.js';
import { CombatLogicModule } from '../modules/logic/combat/combat-logic.module.js';
import { CombatAction } from '../modules/logic/combat/combat.action.js';
import { ZoneLogicModule } from '../modules/logic/zone/zone-logic.module.js';
import { ZoneAction } from '../modules/logic/zone/zone.action.js';
import { QuestLogicModule } from '../modules/logic/quest/quest-logic.module.js';
import { QuestAction } from '../modules/logic/quest/quest.action.js';
import { StoryLogicModule } from '../modules/logic/story/story-logic.module.js';
import { StoryAction } from '../modules/logic/story/story.action.js';
import { IdleLogicModule } from '../modules/logic/idle/idle-logic.module.js';
import { IdleAction } from '../modules/logic/idle/idle.action.js';
import { HealthAction } from './health.action.js';
import { WsAuthInOut } from './ws-auth.inout.js';

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
  QuestAction,    // L3       cmd 110
  StoryAction,    // L3       cmd 120
  IdleAction,     // L4       cmd 130
] as const;

/** 各逻辑服模块 */
const GAME_LOGIC_MODULES = [
  ItemLogicModule,
  PropLogicModule,
  EquipLogicModule,
  SkillLogicModule,
  EconomyLogicModule,
  RealmLogicModule,
  CombatLogicModule,
  ZoneLogicModule,
  QuestLogicModule,
  StoryLogicModule,
  IdleLogicModule,
];

/** InOut 插件（按数组顺序执行 fuckIn） */
export const GAME_INOUT_CLASSES = [WsAuthInOut] as const;

/** 收集后的 Action 实例（与 GAME_ACTION_CLASSES 同序） */
const GAME_ACTION_INSTANCES = Symbol('GAME_ACTION_INSTANCES');
/** 收集后的 InOut 实例（与 GAME_INOUT_CLASSES 同序） */
const GAME_INOUT_INSTANCES = Symbol('GAME_INOUT_INSTANCES');

@Module({
  imports: [AuthModule, ...GAME_LOGIC_MODULES],
  providers: [
    ...GAME_ACTION_CLASSES,
    ...GAME_INOUT_CLASSES,
    {
      provide: GAME_ACTION_INSTANCES,
      useFactory: (...instances: object[]) => instances,
      inject: [...GAME_ACTION_CLASSES],
    },
    {
      provide: GAME_INOUT_INSTANCES,
      useFactory: (...instances: ActionMethodInOut[]) => instances,
      inject: [...GAME_INOUT_CLASSES],
    },
  ],
})
export class GameActionBridgeModule implements OnModuleInit {
  constructor(
    @Inject(IONET_BAR_SKELETON) private readonly skeleton: BarSkeleton,
    @Inject(GAME_ACTION_INSTANCES) private readonly actionInstances: object[],
    @Inject(GAME_INOUT_INSTANCES) private readonly inOutInstances: ActionMethodInOut[],
  ) {}

  onModuleInit(): void {
    GAME_ACTION_CLASSES.forEach((ActionClass, index) => {
      this.skeleton.addAction(ActionClass, this.actionInstances[index]);
    });
    for (const inOut of this.inOutInstances) {
      this.skeleton.inOutChain.add(inOut);
    }
    this.assertNoDuplicateRoutes();
  }

  /** 全局重复路由断言：同一 cmd/subCmd 只能注册一个 Action */
  private assertNoDuplicateRoutes(): void {
    const seen = new Map<number, string>();
    for (const command of this.skeleton.actionCommandRegions.getAllActionCommands()) {
      const { cmd, subCmd, cmdMerge } = command.cmdInfo;
      const label = command.actionControllerClass.name + '.' + command.methodName;
      const prev = seen.get(cmdMerge);
      if (prev) {
        throw new Error(
          '[ionet] 重复路由 cmd=' + cmd + ' subCmd=' + subCmd + '：' + prev + ' 与 ' + label,
        );
      }
      seen.set(cmdMerge, label);
    }
  }
}
