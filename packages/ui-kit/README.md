# @idle-path/ui-kit

通用 UI 组件层（React + antd v6）。**零业务、零 store、零传输层依赖** —— 由 `package.json` 不声明
`@idle-path/*` / `mobx` 依赖 + 源码红线测试双重保证（规划 09 §6.3 规则 2）。

> 规划与反模式依据：`ai-docs/frontend-solution-exploration/09-antd组件化与主题切换实施规划.md`

## 契约

| 约束 | 说明 |
|---|---|
| 受控 | 组件不持有业务状态；`value` + `onChange` 由容器注入 |
| 无业务语义 | 组件不得 import `@idle-path/*`、`mobx`、`node:*`；文案可覆盖（`label` 等 prop） |
| 一组件一目录 | `src/<分组>/<ComponentName>/index.tsx` + 同目录 `index.test.tsx`；一个文件只导出一个组件 |
| 必须有测试 | 每个导出组件与纯函数都有单测，覆盖空/边界/禁用/交互/可访问性名称 |
| 只用 antd | 视觉与交互原语全部来自 antd；不自研控件，不写裸 `div` 布局 |
| 颜色只用 token | 禁止内联 hex、禁止 `!important`、禁止组件内 `<style>` 注入 |

## 目录

```
src/
├── theme/
│   ├── types.ts                  主题契约：ThemeMode('light'|'dark')、DEFAULT_PRIMARY_COLOR、
│   │                             COMPACT_ALWAYS_ON（紧凑恒开，不是配置项）
│   ├── build-theme-config.ts     纯函数：两态 → antd ThemeConfig（algorithm 恒含 compactAlgorithm）
│   ├── ThemeProvider/            ConfigProvider + App + zhCN
│   ├── ThemeToggle/              一键亮/暗切换（Button + Tooltip，图标型）
│   └── ThemeFloatButton/         同一语义的悬浮呈现（FloatButton）
├── layout/                       AppShell / SideNav / HudBar / PageShell / SectionCard / Toolbar / PanelTabs
├── pluggable/panel-registry/     PanelRegistry（纯 TS，config 驱动的可插拔入口）
├── data/                         DataTable<T> / ResourceGrid<T> / KeyValueList / StatItem / StatGrid
├── feedback/                     AsyncBoundary / ConfirmAction / SubmitButton / PanelPlaceholder
├── form/                         TextField / PasswordField / NumberField / SelectField / SwitchField / ActionForm / ModalForm
├── game/                         RarityTag / ItemCard / ResourceBar / QuantityInput / EmptyHint / ActionBar
└── index.ts                      barrel：按分组 re-export 公开组件与类型
```

## 组件清单（36 个 + 1 注册表）

| 分组 | 组件 | 关键 props |
|---|---|---|
| theme | `ThemeProvider` / `ThemeToggle` / `ThemeFloatButton` | `mode`、`primaryColor`、`value`+`onChange` |
| layout | `AppShell` | `nav, header, headerExtra, hud, collapsible, collapsed, onCollapse, siderWidth, mobile, children`（**响应式**：lg 以上 Sider、以下 Drawer） |
| layout | `SideNav` | `groups, selectedKey, onSelect, collapsed, title, footer`（配置驱动分组菜单） |
| layout | `HudBar` | `items({key,label,value,icon?,tooltip?}), extra, loading`（紧凑聚类 + 自动换行） |
| layout | `PageShell` | `title, subtitle, extra, toolbar, children` |
| layout | `SectionCard` | `title, subtitle, extra, loading, children` |
| layout | `Toolbar` | `left, right, children` |
| layout | `PanelTabs` | `items, activeKey, defaultActiveKey, onChange, destroyOnHidden, centered` |
| pluggable | `createPanelRegistry` | `register/unregister/has/get/registerAll/list/size/clear` |
| data | `DataTable<T>` | `columns, dataSource, rowKey, loading, emptyText, pagination, rowActions, onRowClick, scrollX, title` |
| data | `ResourceGrid<T>` | `items, renderItem, keyOf, span, loading, emptyText, columns` |
| data | `KeyValueList` | `items, column, bordered, title, layout, emptyText` |
| data | `StatItem` / `StatGrid` | `label, value, prefix, suffix, precision, loading` / `items, column, loading, bordered` |
| feedback | `AsyncBoundary` | `loading, error, empty, emptyText, skeletonRows, onRetry, retryText`（优先级 loading>error>empty） |
| feedback | `ConfirmAction` | `title, description, onConfirm, okText, cancelText, danger, disabled, children` |
| feedback | `SubmitButton` | `children, loading, disabled, htmlType`（**缺省 `submit`**）, `block, danger, onClick` |
| feedback | `PanelPlaceholder` | `title, description?, status?('pending'\|'planned'), highlights?, icon?` |
| form | `TextField` / `PasswordField` / `NumberField` / `SelectField` / `SwitchField` | `name, label, required, rules, help, …`（PasswordField 用 `Input.Password`；Switch 自动 `valuePropName="checked"`） |
| form | `ActionForm` | `fields, initialValues, submitText, cancelText, loading, disabled, layout, onFinish, onCancel` |
| form | `ModalForm` | `open, title, fields, initialValues, confirmText, cancelText, loading, width, onCancel, onFinish` |
| game | `RarityTag` | `rarity`(clamp 0..3)、`labels`、`showLabel`、`bordered`；导出 `RARITY_LABELS` |
| game | `ItemCard` | `name, tier, rarity, meta, affixTexts, actions, footer, selected, onClick` |
| game | `ResourceBar` | `label, current, max, suffix, showPercent, status, tooltip`（边界安全：0/NaN/Inf → 0%） |
| game | `QuantityInput` | `value, onChange, min, max, step, disabled, placeholder, addonAfter` |
| game | `EmptyHint` | `description, action, compact` |
| game | `ActionBar` | `actions: ActionDescriptor[], max, loadingKey`（超出 `max` 折叠进「更多」） |

`ActionField`（`ActionForm` 导出）是判别联合：`{kind:'text'|'number'|'select'|'switch'} & <对应字段 props>`。

## 主题决策（不要回退）

- **只有 `'light' | 'dark'` 两态**：不做 `'system'` 第三态，避免三态 + OS 事件 + 首帧竞态。
- **紧凑恒开**：`theme.compactAlgorithm` 永远在 algorithm 数组里；**不提供开关**
  （开关会导致布局错位与 PC/移动端双份适配成本）。因此组件级也不要再各自设 `size`。
- 主题色是**常量**（`DEFAULT_PRIMARY_COLOR`）；不提供 UI 选择器。将来要开放，只改此常量与选择器层。

## 响应式（PC + 移动双端）

- `AppShell` 自己判定断点：`Grid.useBreakpoint()` → `lg` 及以上渲染**固定 Sider**，以下渲染**左侧 Drawer**
  （页头出现菜单按钮；抽屉内任意点击即关闭——用**捕获阶段**监听，因为 antd `Menu` 条目点击会 `stopPropagation`）。
  断点未知的首帧按**桌面**处理，避免移动端「先桌面后抽屉」闪动；`mobile` 可显式强制。
- `HudBar` 用**紧凑聚类**（`label + value` 成对、整体 `wrap`），不用 `Descriptions`：
  后者的等宽表格单元格在 PC 上会把 5 项拉满整宽、在窄屏会把取值压成**单字竖排**（已实测踩坑）。
- 数值与时长的展示统一走 `formatDuration`（ui-kit）与 `web/domain/format.ts`，禁止裸浮点直出。

## 测试辅助：`@idle-path/ui-kit/testing`

jsdom 不实现 `matchMedia`，而 antd 的响应式（`Grid.useBreakpoint` / `Sider breakpoint` / `Drawer`）全靠它。
该子路径导出**可控视口** mock，ui-kit 与 web 的测试 setup 共用同一实现：

```ts
import { installViewportMock, setViewportWidth, resetViewport } from '@idle-path/ui-kit/testing';

installViewportMock(window);   // 默认视口 1280（桌面）
setViewportWidth(393);         // 切到手机宽度 → 断言移动布局
resetViewport();               // 复位（setup 的 afterEach 已自动调用）
```

## 可执行门禁

`test/hygiene.test.ts`（11 条，`pnpm test` 即跑）把红线做成失败用例，而不是注释纪律：

1. `src` 不得 import `@idle-path/*` / `mobx` / `node:`，且 `package.json` 也不得声明它们；
2. 颜色不得内联 hex（唯一例外 `theme/types.ts` 的主题色常量，且断言只有一处）；
3. 不得 `!important`；4. 不得组件内 `<style>`；5. 不得**静态导入** antd 的 `message`/`notification`，也不得调用 `Modal.confirm` 等静态方法
   （`const { message } = App.useApp()` 是正解，不算违规）；
6. 每个组件目录必须有同目录测试；7. 一个 `.tsx` 只导出一个组件（常量/类型不受限）；8. 不得 `export default`；
9. 单文件 ≤200 行。

覆盖率门槛（`vitest.config.ts`）：statements/lines/functions ≥90%、branches ≥85%（实测 99.54 / 99.54 / 96.92 / 95.81）。

## 与 antd v6 的已知偏差（均为 v6 API 差异，接口不变）

| 处 | v6 实际 | 处理 |
|---|---|---|
| `Card.footer` | v6 无此 prop | `ItemCard.footer` 渲染在卡体末区块（`data-testid="item-card-footer"`） |
| `Card.bordered` | 已弃用 | 改用 `variant: 'outlined' \| 'borderless'` |
| `Statistic.valueStyle` | 已弃用 | 转发为 `styles={{ content: valueStyle }}` |
| `Space.direction` | 已弃用 | 用 `orientation="vertical"` |
| `InputNumber.addonAfter` | 已弃用（会打 warning） | 仅在传入时落 antd；M3 视情况改 `Space.Compact` |
| Button 文案 | 两个汉字间自动插空格（可访问名成「更 多」） | 测试用 `/更\s*多/` 匹配，DOM 文案不变 |
| `NumberFieldProps` | 12 个 props，超出「≤10」规则 | **唯一豁免**：字段组件接口由规格逐字固定，拆分反而降低可用性 |

## 用法

```tsx
import { ThemeProvider, ThemeToggle, buildThemeConfig } from '@idle-path/ui-kit';

<ThemeProvider mode={mode}>
  <ThemeToggle value={mode} onChange={setMode} />
  <App />
</ThemeProvider>
```

## 新增一个组件的步骤

1. 建目录 `src/<分组>/<Name>/`，写 `index.tsx`（具名导出 `Name` 与 `NameProps`，无 default）。
2. 同目录写 `index.test.tsx`：至少覆盖 正常渲染 / 空数据 / 边界（`undefined`/空数组/`0`/禁用）/
   交互回调 / 可访问性名称（`getByRole`）。
3. 在 `src/index.ts` 对应分组追加 `export *`（或具名导出）。
4. 若引入颜色，只能用 antd token（`theme.useToken()`）或预设色名，不得写 hex。
5. 跑 `pnpm --filter @idle-path/ui-kit run test`（含覆盖率门槛与红线门禁）与 `run typecheck`。

## 验收

```bash
pnpm --filter @idle-path/ui-kit run typecheck
pnpm --filter @idle-path/ui-kit run test      # jsdom + RTL + 覆盖率门槛 + 红线门禁（225 例）
pnpm --filter @idle-path/ui-kit run test:unit # 快速迭代（不跑覆盖率）
pnpm --filter @idle-path/ui-kit run build     # tsc 产出 dist
```

> 测试较慢（antd + jsdom 的 CSS-in-JS 成本，单文件 1~20s，全量约 60s）；`testTimeout` 已放宽到 20s 以避免并发下偶发超时。
