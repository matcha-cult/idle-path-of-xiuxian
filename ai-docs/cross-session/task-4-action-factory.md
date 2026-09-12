# 任务 4 · ActionFactoryBeanForNest（Action 走 NestJS DI）

> 归口：`../protocol.md`；沟通记录：`../session-collaboration.md`（只增不删）。

## 1. 现状（消费方实测证据）

- `packages/core-framework/src/core/bar-skeleton.ts:44`：`addAction(ActionClass, instance?)` 不传 instance 时**直接 `new ActionClass()`**，业务 Action 拿不到 NestJS 容器依赖。
- `packages/core-framework/src/core/action-factory-bean.ts` 已有 `ActionFactoryBean` / `DefaultActionFactoryBean`，但**全仓库无人使用**。
- 消费方现用 `packages/server/src/ionet/game-action-bridge.module.ts`（应用内工厂令牌 + `onModuleInit` 手动 `skeleton.addAction(Class, instance)`）绕过。

## 2. 要求

- `core-framework`：`BarSkeletonBuilder`/`BarSkeleton` 支持自定义工厂（如 `setActionFactory(f: ActionFactoryBean)`）；**未设置时回退 `new`**（行为不变）。
- `extension-nestjs`：Action 作为 Nest provider，工厂从容器解析实例并注册进骨架。
- ⚠️ **必须避开的陷阱（消费方已实证）**：跨仓库 pnpm workspace 链接下，应用侧与框架侧可能各自解析到**物理上独立的一份 `@nestjs/core`**，
  类令牌（`ModuleRef`/`Reflector`/`HttpAdapterHost`）注入会**静默降级为 `undefined`**。
  因此工厂实现**不要依赖跨副本可变的类令牌**；建议由应用侧显式传入解析函数
  （如 `forRoot({ resolveAction: (Cls) => app.get(Cls) })`），或使用 symbol token。
- 消费方验收目标：升级后删除 `game-action-bridge.module.ts`，12 个 Action 仍全部注册，`e2e:all`/`e2e:journey` 全绿。

## 3. 测试（`packages/extension-nestjs/tests/**`）

- [ ] 工厂被调用且每个 Action 只注册一次
- [ ] 容器实例被复用（`get(Cls)` 返回同一对象）
- [ ] 未提供工厂时回退 `new`
- [ ] 与 `forFeature` 组合时注册顺序正确

## 4. 消费方升级后的验收（A 侧执行）

- 删除桥接模块，`test/ionet/bridge.test.ts` 相应调整，确认 12 个 Action 仍注册
