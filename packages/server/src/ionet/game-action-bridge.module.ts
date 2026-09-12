/**
 * Action ↔ NestJS DI 桥接模块
 *
 * 问题：ionet 的 BarSkeleton.addAction(ActionClass) 不传 instance 时会直接
 * `new ActionClass()`，Action 拿不到 NestJS 容器里的服务（无 DI）。
 *
 * 方案（Track A，不改 vendor）：
 * 1. 各逻辑服 Action 标 @Injectable()，在本模块登记为 provider；
 * 2. IonetModule.forRoot({ actions: [] }) 构建空骨架；
 * 3. 本模块用「应用内工厂令牌」把 Action 实例收集成数组，在 onModuleInit
 *    （早于 app.listen）逐个 skeleton.addAction(ActionClass, instance)，并挂载 InOut。
 *
 * 为什么不用 ModuleRef：跨 workspace（pnpm workspace:*）下 @nestjs/core 可能
 * 存在多份物理副本，框架侧注入的类令牌会静默降级为 undefined（已实证）。
 * 这里只用本模块自己声明的 Symbol/类 provider 令牌，不跨副本。
 *
 * 新增逻辑服：把 Action 类加进 GAME_ACTION_CLASSES，并在 imports 补其依赖模块。
 */
import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { type ActionMethodInOut, type BarSkeleton } from '@nbb-ionet/core-framework';
import { IONET_BAR_SKELETON } from '@nbb-ionet/extension-nestjs';
import { AuthModule } from '../modules/auth/auth.module.js';
import { IdleLogicModule } from '../modules/logic/idle/idle-logic.module.js';
import { IdleAction } from '../modules/logic/idle/idle.action.js';
import { HealthAction } from './health.action.js';
import { WsAuthInOut } from './ws-auth.inout.js';

/** 已登记的逻辑服 Action 类（M2/M3 逐步扩充） */
export const GAME_ACTION_CLASSES = [HealthAction, IdleAction] as const;

/** InOut 插件（按数组顺序执行 fuckIn） */
export const GAME_INOUT_CLASSES = [WsAuthInOut] as const;

/** 收集后的 Action 实例（与 GAME_ACTION_CLASSES 同序） */
const GAME_ACTION_INSTANCES = Symbol('GAME_ACTION_INSTANCES');
/** 收集后的 InOut 实例（与 GAME_INOUT_CLASSES 同序） */
const GAME_INOUT_INSTANCES = Symbol('GAME_INOUT_INSTANCES');

@Module({
  imports: [AuthModule, IdleLogicModule],
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
  }
}
