# 09 · antd 组件化 · 紧凑布局 · 一键主题切换 实施规划

> 前置：任务 1.5 已交付 `packages/ionet-transport`（transport + typed API）与 `packages/web`
> （React 18 + Vite 5 + MobX 6，11 域 Store）。本规划是**前端 UI 层的重构与新约束落地**，
> 不触碰 transport / Store 的对外契约（Store 只作为容器层的数据源）。
>
> 用户新约束（本规划的唯一验收口径）：
> 1. 必须使用 **antd 组件**；所有 UI 一律用 antd 既有组件实现，除非 antd 不满足（不满足处需显式说明并最小自研）。
> 2. 游戏组件设计必须**可插拔、可通用**；**禁止**把一个复杂且可通用的组件耦合进单个文件实现。
> 3. **所有组件必须有单元测试**。
> 4. 必须使用 antd **紧凑布局**（compact）。
> 5. 必须支持**一键主题切换**。

---

## 0. 现状与差距（实测，2026-09-13）

| 项 | 现状 | 差距 |
|---|---|---|
| 页面 | `src/pages/GamePanelPage.tsx` **755 行**，内含 11 个内联 `*Tab` 组件（74–611 行） | 直接违反约束 2：一个文件塞了 11 个可通用/可拆分的域面板 |
| 组件 | 仅 `ConnectionBar.tsx`(44) / `ToastHost.tsx`(26)，手写 div + 自定义 class | 违反约束 1（非 antd）；无通用组件层 |
| 样式 | `src/styles.css` **441 行**手写 CSS（含 `:root` 变量、工具类） | 目标：由 antd token/组件吸收，仅保留极少数布局胶水 |
| 测试 | `test/` 仅 4 个**Store** 测试（node 环境，vitest `environment: 'node'`） | 违反约束 3：**0 个组件测试**；缺 jsdom + RTL 基建 |
| 依赖 | 无 `antd` / `@ant-design/icons` / `@testing-library/*` / `jsdom` | 需新增 |
| 主题 | 无；暗色是硬编码 CSS 变量 | 违反约束 5 |
| 紧凑 | 无 | 违反约束 4 |

---

## 1. 目标架构（分层与依赖方向）

```
pages/           容器层：连 Store / 组装通用组件（允许 import store 与 transport 类型）
  └── panels/    域面板：每个游戏域一个文件（<150 行），只做「Store → 通用组件 props」映射
        └── @idle-path/ui-kit   通用组件层：**零业务、零 store、零 transport 依赖**（纯 props/插槽）
              └── antd             所有视觉与交互原语
```

- **可插拔核心 = 注册表 + 插槽**，不是继承、不是 switch：
  - `PanelRegistry`：域面板以 `{ key, label, icon, order, component }` 注册；新增游戏域 = 新增 1 个文件 + 1 行注册，**不改**页面壳。
  - `ActionRegistry` / `ActionBar`：动作按钮以描述对象声明（`{ key, label, icon, danger?, confirm?, disabled?, run }`），通用渲染与二次确认。
  - 数据组件泛型化：`DataTable<T>` / `ResourceGrid<T>` 用 `columns` / `renderItem` 插槽，不感知任何游戏概念。
- **禁止**在组件里 `useRootStore()`：数据与回调一律从 props 进（容器/展示分离），这也是组件可单测的前提。
- **边界强制**：`ui-kit` 的 `package.json` 不声明 `@idle-path/ionet-transport`，故编译期就 import 不到业务类型（比 lint 规则更硬）。

---

## 2. 决策点（已拍板，2026-09-13）

| # | 决策 | 结论 | 理由 / 影响 |
|---|---|---|---|
| D1 | antd 主版本 | ✅ **antd v6（6.6.3）** + `@ant-design/icons` v6 | user 指定；peer 要求 React ≥18（本项目 18.3.1 满足）；v6 为 CSS 变量优先，主题切换更干净 |
| D2 | 通用组件层落点 | ✅ **新包 `packages/ui-kit`（`@idle-path/ui-kit`）** | 物理隔离：不声明 transport/store 依赖 → 编译期即保证「可通用」；web 只做容器 |
| D3 | 主题范围 | ✅ **仅「亮 + 暗」两态一键切换**；**紧凑常开、不提供开关** | user 明确更正：多状态/开关会造成更多 UI 错位、放大 PC+移动端兼容成本（参考项目已踩坑）。故**移除** `system` 跟随、主题色选择器、紧凑开关 |
| D4 | 自研兜底 | ✅ 默认 **0 自研** | antd 确无对应物时才用 antd 组合封装，仍不写裸 DOM；每处例外需在代码注释与 README 注明 |

### 2.1 D3 的硬性取舍（不要回退）

- **只有 `'light' | 'dark'` 两个状态**：不做 `'system'` 第三态，避免「三态切换 + 系统事件监听 + 首次进入竞态」。
- **紧凑是常量，不是配置**：`compactAlgorithm` 恒在；**不暴露开关**，避免「紧凑关掉后布局错位」与双端适配双份验证成本。
- 主题色不做 UI 选择器（token 默认值集中在 `ui-kit` 一处常量；将来若要开放，加在选择器层，不动组件）。
- 主题选择**持久化到 `localStorage`**，首次进入默认亮色（不做 OS 偏好推断，保持两态语义单纯）。

---

## 3. 任务分解（T-A ~ T-F，每任务独立可验证）

### T-A · 工程基建与测试环境（阻塞其余全部）
1. `packages/web` devDeps：`antd@5`、`@ant-design/icons`、`@testing-library/react`、`@testing-library/user-event`、`@testing-library/jest-dom`、`jsdom`。
2. vitest 改造：默认 `environment: 'jsdom'`，Store/协议测试用文件头 `// @vitest-environment node` 保持原语义（或 vitest `workspace/projects` 双 project：`stores`(node) / `components`(jsdom)）——二选一，倾向前者（改动最小）。
3. `test/setup-ui.ts`：`@testing-library/jest-dom/vitest`、`window.matchMedia` mock、`ResizeObserver` mock、`scrollTo` mock、每例自动 `cleanup()`、antd `ConfigProvider + App` 测试包装 `renderWithTheme(ui)`。
4. 覆盖率：vitest `coverage` 开启，`components`/`ui-kit` 目录行覆盖阈值（建议 ≥90%）。
5. 验收：`pnpm --filter idle-path-web run test` 全绿（既有 34 例不回归），`typecheck` 0 错。

### T-B · `packages/ui-kit` 包骨架（依赖 D2）
1. `package.json`（deps：`antd`、`react`、`@ant-design/icons`；**不依赖** transport/store）、`tsconfig`、`vite.config`（库模式 `build`）+ vitest。
2. 目录约定：`src/<category>/<ComponentName>/index.tsx + index.test.tsx`（一组件一目录，禁止跨组件堆同文件）。
3. barrel `src/index.ts` 只导出公开组件与 props 类型。
4. 红线断言测试：扫描 `ui-kit/src` 中不得出现 `@idle-path/`、`mobx`、`node:`（源码级测试，防回归）。
5. 验收：`pnpm --filter @idle-path/ui-kit run build|test|typecheck` 全绿。

### T-C · 主题与紧凑布局（约束 4、5）
1. `packages/ui-kit/src/theme/`：
   - `types.ts`：`ThemeMode = 'light' | 'dark'`（**只有两态**，见 D3）、`AppThemeInput`。
   - `build-theme-config.ts`（**纯函数，优先单测**）：
     `algorithm: [mode==='dark'?darkAlgorithm:defaultAlgorithm, compactAlgorithm]`（**compact 恒在，不参数化**）、
     `token: { colorPrimary: DEFAULT_PRIMARY_COLOR, borderRadius }`、`cssVar: true`。
   - `ThemeToggle/`：受控纯展示组件（`value: ThemeMode` + `onChange`），
     单按钮一键翻转（antd `Button` + `Tooltip` + `Sun/Moon` 图标），无 store 依赖。
2. `packages/web/src/theme/`：
   - `theme-store.ts`（MobX `makeAutoObservable` + `runInAction`）：`mode`、`setMode`、`toggle`、`hydrate`（localStorage）；
     **不监听 OS 偏好、无 compact 字段**。
   - `ThemeController.tsx`：`observer` 容器，读 `ThemeStore` → 渲染 ui-kit `ThemeProvider` + `ThemeToggle`。
   - `theme-provider.tsx`：`ConfigProvider` + antd `App`（提供 `message/notification/modal` 上下文，禁止静态方法）+ `locale=zhCN`。
3. 防闪烁：`index.html` 内联极短脚本，读 `localStorage` 预设 `document.documentElement.dataset.theme` 与 `color-scheme`（**唯一允许的裸 DOM**，集中在此）。
4. 紧凑落地：全局 `compactAlgorithm`；**组件级不再各自设 `size`**（避免「紧凑 + small 叠加」造成错位）。
5. 验收（组件单测）：亮/暗切换后 `data-theme` 与 `color-scheme` 正确、`buildThemeConfig` 的 algorithm 数组恒含 `compactAlgorithm`、
   持久化恢复、非法 localStorage 值回退亮色、按钮可键盘操作（`getByRole('button')`）。

### T-D · 通用可插拔组件库（约束 1、2 的主体）
每个组件：一目录一文件一测试；全部基于 antd；props 驱动 + 插槽；无业务语义（游戏语义件单独成组且仍通用）。

| 分组 | 组件 | 基于的 antd | 说明 |
|---|---|---|---|
| 布局 | `PageShell` | `Layout` + `PageHeader`(自组合 `Typography`/`Flex`) | 页头/工具条/内容三段，插槽 `headerExtra` `toolbar` |
| 布局 | `SectionCard` | `Card` | 标题/副标题/extra/children |
| 布局 | `Toolbar` | `Space` + `Flex` | 左/右插槽，自动换行 |
| 布局 | `PanelTabs` | `Tabs` | **config 驱动**：`items[]`（可插拔入口） |
| 数据 | `DataTable<T>` | `Table` | 泛型列、`size='small'`、分页、空态、行操作插槽、`rowKey` |
| 数据 | `ResourceGrid<T>` | `Row/Col` + `Card` | 卡片网格，`renderItem` 插槽，响应式 span |
| 数据 | `KeyValueList` | `Descriptions` | 键值展示（替代手写 `dl.kv`） |
| 数据 | `StatGrid` / `StatItem` | `Statistic` + `Card` | 数值面板 |
| 反馈 | `AsyncBoundary` | `Skeleton` + `Result` + `Empty` + `Alert` | loading/error/empty/children 四态统一 |
| 反馈 | `ConfirmAction` | `Popconfirm` / `Modal.confirm` | 危险操作二次确认的统一封装 |
| 反馈 | `ToastBridge` | `App.useApp()` 的 `message/notification` | 把 ToastStore 事件桥到 antd（容器层，非通用件，放 web） |
| 表单 | `ActionForm` | `Form` + `Input/InputNumber/Select/Switch` | **schema 驱动**：`fields[]`，`onSubmit`，自动校验 |
| 表单 | `NumberField` / `TextField` / `SelectField` | `Form.Item` + 对应控件 | 单字段封装，供 schema 复用 |
| 表单 | `ModalForm` | `Modal` + `ActionForm` | 弹窗表单，确定/取消/loading |
| 表单 | `SubmitButton` | `Button` | 提交态防重复 |
| 游戏通用 | `RarityTag` | `Tag` | `rarity: 0..3` → 文案/色（颜色由调用方或内置色板注入） |
| 游戏通用 | `ItemCard` | `Card` + `Tag` + `Space` | 物品展示：名称/阶/稀有度/词缀列表/actions 插槽 |
| 游戏通用 | `ResourceBar` | `Progress` + `Tooltip` | 资源/经验条 |
| 游戏通用 | `QuantityInput` | `InputNumber` | 数量选择（min/max/step 边界） |
| 游戏通用 | `EmptyHint` | `Empty` | 统一空态 + 引导动作插槽 |
| 插拔 | `ActionBar` | `Space` + `Button` + `Dropdown` | 由 `ActionDescriptor[]` 渲染（含 disabled/confirm/loading） |
| 插拔 | `PanelRegistry`（非组件，纯 TS） | — | `register/resolve/list`，`PanelTabs` 消费 |

> 判定口径：能用 antd 组合实现即不自研控件；`ui-kit` 不出现裸 `div` 布局（仅允许 antd 组件与必要的 `Flex/Space/Grid`）。

### T-E · 页面与域面板拆分（约束 2 的落地）
1. `pages/login/LoginPage.tsx`：`Form` + `Card` + `Segmented`(登录/注册) + `Alert`。
2. `pages/character-create/CharacterCreatePage.tsx`：`Form` + `Radio.Group` + `Result`。
3. `pages/game/GameShellPage.tsx`（目标 ≤80 行）：`PageShell` + `PanelTabs(items=registry)` + `ConnectionStatus`(antd `Badge/Tag`) + `ThemeToggle`。
4. `pages/game/panels/`：`BagPanel / EquipPanel / SkillPanel / RealmPanel / EconomyPanel / ZonePanel / QuestPanel / CombatPanel / StoryPanel / IdlePanel / SettingsPanel` —— 每个 `<150 行`，只做 Store→组件映射。
5. `pages/game/panel-registry.ts`：注册 11 个面板（`key/label/icon/order/component`）。
6. **删除** `src/pages/GamePanelPage.tsx`（755 行）与 `src/styles.css`（441 行，残留仅布局胶水并重命名 `base.css`）。
7. `ConnectionBar` / `ToastHost` 重写为 `ConnectionStatus`（`Badge`+`Descriptions`+`Space`）与 `ToastBridge`（antd `message`）。
8. 验收：`wc -l` 断言「无单文件 > 200 行（除 store/registry）」的测试或 CI 检查脚本。

### T-F · 测试与验收（约束 3）
1. **组件测试**：`ui-kit` 每个组件 ≥1 测试文件，覆盖：正常、空数据、`undefined`/`null` 边界、禁用、错误态、交互回调（`user-event`）、a11y 基本断言（`getByRole`）。
2. **页面测试**：`GameShellPage`/各 Panel 用假 RootStore（复用现有 `FakeSocketAdapter + MemoryIonetServer + 假 fetch`）渲染，断言「加载态→数据→动作触发」。
3. **主题测试**：切换亮暗/紧凑后 `document.documentElement.dataset.theme`、antd token（`getComputedStyle` 或 `ConfigProvider` 上下文断言）、持久化恢复、跟随系统。
4. **回归**：既有 transport 65 例、web 34 例、真后端 `IONET_E2E=1` 全绿。
5. **真机**：`vite build` + `pnpm -r build` exit 0；bundle 红线扫描（无 `node:*`、无 Node-only `@nbb-ionet/*`）；Vite 5173 `/api` + `/ws` 代理探针；浏览器人工过一遍 11 个面板。
6. **文档**：`packages/ui-kit/README.md`（组件契约 + 新增组件步骤）、更新 `packages/web/README.md`、`ai-docs/frontend-solution-exploration/` 增补 09（本文件）与后续 10（实施记录）。

---

## 4. 里程碑与提交切分（每步可独立验收）

| 里程碑 | 内容 | 提交 | 验收 |
|---|---|---|---|
| **M1** | T-A 基建 + T-C 主题/紧凑 + T-B 包骨架 | ✅ 2026-09-13 完成 | 主题切换可用；既有测试零回归 |
| **M2** | T-D 通用组件层（约 22 个组件 + 22 个测试） | 按分组 3~4 个 commit | ui-kit 覆盖率 ≥90% |
| **M3** | T-E 页面与 11 面板拆分 | 2 个 commit | 无 >200 行文件；页面测试全绿 |
| **M4** | T-F 全量验收 + 文档 | 1 个 commit | 全部命令绿 + 浏览器人工确认 |

> **M1 已交付实测（2026-09-13）**：ui-kit 单测 31 例、web 单测 67 例 + 真后端 e2e 1 例全绿；
> `pnpm -r run build` exit 0；`styles.css` 硬编码色值 0 命中；ui-kit 源码业务/mobx/node 依赖 0 命中；
> Vite dev 实测首帧防闪烁脚本、`/api` 代理、`/ws` 无 token 401 均正常。
> 遗留：antd 全量引入后 bundle 618KB（gz 199KB），M4 用 `manualChunks` 拆 vendor 并复测。

---

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| antd 在 jsdom 下的坑（`matchMedia`、`ResizeObserver`、`rc-virtual-list`、`getComputedStyle`） | T-A 的 `setup-ui.ts` 统一兜底；组件测试避免依赖真实布局测量 |
| antd 全量引入导致 bundle 膨胀 | antd v5 ES 产物默认 tree-shaking；M4 实测 gz 体积并记录；必要时按需 import |
| 主题切换首屏闪烁（FOUC） | `index.html` 内联预设脚本（唯一允许的裸 DOM） |
| UI 重构导致既有 e2e/人工流程回归 | 保留 `IONET_E2E=1` 真后端用例 + 每域面板测试；M3 后立刻重跑真机链路 |
| 组件「通用」被业务语义污染 | `ui-kit` 物理隔离（不依赖 transport/store）+ 源码红线测试 |
| 组件测试数量大（22+ 文件） | 用统一的 `renderWithTheme` 测试工具与 fixture 工厂，降低单例成本 |

---

## 6. 参考项目反模式（stock-sim 只读审计结论）与由此而来的硬规则

> 来源：对 `/home/nbb/projects/stock-sim/new-client/src` 的只读审计（2026-09-13，含 MobX 运行时探针）。
> **这些坑在本项目一律视为缺陷**，规则尽量做成编译期/CI 可检查项，而不是注释里的纪律。

### 6.1 组件耦合反模式（精选，均带原项目证据）

| # | 反模式 | 本项目对应防线 |
|---|---|---|
| A1 | 上帝外壳：2137 行页面一次 import 14 个页面，任一处改动都撞同一文件 | 页面壳只做注册表路由（M3），新增域不改壳 |
| A2 | 业务规则写进 UI：费用公式定义在 `ShopPanel.tsx` | 公式/数值只进 `domain/` 或服务端；组件零业务常量 |
| A3 | 同一规则多份实现：组件硬编码佣金率 vs DTO 已下发 | 只认 DTO；前端常量副本视为缺陷 |
| A4 | 玩法数值写死成文案（「5% 触发」写进 JSX） | 数值来自服务端配置/DTO，不写进 UI 文案 |
| A5 | 同一格式化 8 份、标签映射 4 份、公式 2 份且互相不一致 | 跨文件复用逻辑唯一 `utils`/`domain` 入口 + 单测 |
| A6 | 50 个组件直连 `services/api`，组件内自建 fetch/loading | 组件禁止 import 网络层/store；数据只经 props 或容器注入 |
| A7 | 上帝 props：37 个 props 逐层搬运 | 组件 props ≤10；超出改传领域对象或容器订阅 |
| A8 | `Modal.confirm` 静态方法脱离上下文（主题/locale 失效） | 一律 `App.useApp()` 取 `modal/message/notification` |
| A9 | 41 处内联硬编码色 | 颜色只来自 antd token（`theme.useToken()`），禁内联 hex |
| A10 | 组件内 `<style>` 注入全局 CSS + `!important` | 禁组件内全局样式；用 antd 语义 props/`classNames` |
| A11 | 引用从未定义的 CSS 变量（`--panel-bg-soft`）导致深色回退 | 变量集中定义并校验；本项目优先 token，不自定义变量 |
| A12 | 注释写「避免 !important」，同文件就用了 | 纪律改为 lint/stylelint 规则（M2 引入） |
| A13 | 双主题系统并行（手写 `data-theme` + CSS 变量 vs antd token） | **只保留 antd token 一套**；`data-theme` 仅作为防闪烁标记 |
| A14 | 死依赖（mobx-state-tree / react-router 全仓 0 引用） | 依赖新增需在 README 说明用途；不引入第二套状态/路由方案 |

### 6.2 MobX 反模式（精选）

| # | 反模式 | 本项目对应防线 |
|---|---|---|
| B1 | 同仓两种写法：部分 store 从不用 `runInAction` | 只允许 `makeAutoObservable` + `runInAction` 一种组合 |
| B2 | 构造器里发请求；组件渲染期 `new RootStore()` | Store 构造函数**零副作用**；RootStore 在模块级创建一次（本项目已如此） |
| B3 | `await` 之后的 observable 写入不在 action 内 → 中间态连续渲染 | 现有 store 已全部用 `runInAction`；**新增 store 必须同规** |
| B4 | 组件直接改 observable 字段 | 每个可变字段只暴露 action setter；组件只读 |
| B5 | 竞态防护不一致（旧响应覆盖新数据） | 异步回写前校验请求键（M3 各面板接入时落实） |
| B6 | 一个 `Observer` 包整棵树；`theme={{...}}` 内联字面量 | 叶子组件各自 `observer`；主题对象由 `buildThemeConfig` 稳定产出 |
| B7 | 派生数据放 `useMemo`，与 DTO 原态双份 | 派生进 store `computed`，组件不缓存派生 |
| B8 | 大数组深 observable，无 `shallow`/`ref` | 只读 DTO 数组用 `observable.shallow`/`ref`（M3 落实） |
| B9 | store 里拼 UI 文案、网络层直接弹 toast | store 只存状态；文案/toast 归 UI 层（现有 `ToastStore` 即此定位） |
| B10 | 全仓 0 测试 | 组件与 store 均须单测（约束 3） |

### 6.3 本项目新增/强化的硬规则（可检查）

1. 单文件 ≤200 行（store/registry/常量表例外，需在文件头注明理由）；单文件 ≤1 个导出组件。
2. `ui-kit` 组件禁止 import `@idle-path/*`、`mobx`、`node:*` → 由 `ui-kit` 源码红线测试 + `package.json` 不声明依赖双重保证。
3. 组件 props ≤10；颜色/间距/圆角只来自 antd token，禁内联 hex、禁 `!important`、禁组件内 `<style>`。
4. antd 反馈 API 一律 `App.useApp()`；禁 `message.*` / `Modal.confirm` 静态调用。
5. 主题只有亮/暗两态；紧凑恒开；`data-theme` 只作防闪烁标记，不作为样式来源。
6. 每个组件与纯函数必须有单测；覆盖率门槛 M2 起生效。
7. 业务数值/公式/枚举映射只允许一处定义（`domain/`），组件与 store 均消费同一份。

---

## 7. 明确不做

- 不引入 `@ant-design/pro-components`（默认；若后续需要 ProTable 再单列决策）。
- 不改 `packages/ionet-transport` 与 Store 对外契约（仅在容器层消费）。
- 不做小程序适配（仍留待后续阶段）。
