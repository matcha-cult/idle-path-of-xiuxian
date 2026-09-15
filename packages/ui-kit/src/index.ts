/**
 * `@idle-path/ui-kit` —— 通用 UI 组件层。
 *
 * 硬约束（规划 09 §6.3，由 `test/hygiene.test.ts` 的可执行门禁强制）：
 * - 只依赖 `antd` + `react`；**禁止** import `@idle-path/*`、`mobx`、`node:*`；
 * - 组件一律**受控 + props 驱动**，不依赖任何 store；数据与回调由容器注入；
 * - 一组件一目录一文件，一个文件只导出一个组件，且必须有同目录单测；
 * - 颜色只用 antd token / 预设色名：禁内联 hex、禁 `!important`、禁组件内 `<style>`；
 * - 反馈 API 一律 `App.useApp()`（禁 `Modal.confirm` / `message.*` 静态调用）。
 *
 * 分组：
 * - `theme/`      主题契约、Provider、一键亮/暗切换
 * - `layout/`     页面壳、区块卡片、工具条、配置驱动 Tab
 * - `pluggable/`  可插拔注册表（纯 TS，无 React 运行时依赖）
 * - `data/`       表格、卡片网格、键值列表、统计
 * - `feedback/`   四态门、渲染期错误兜底、二次确认、提交按钮
 * - `form/`       schema 驱动表单与字段
 * - `game/`       游戏语义通用件（稀有度、物品卡、资源条、动作条…）
 */

// ===== theme =====
export {
  COMPACT_ALWAYS_ON,
  DEFAULT_PRIMARY_COLOR,
  THEME_TOGGLE_LABELS,
  nextThemeMode,
  themeToggleLabel,
  type ThemeMode,
} from './theme/types.js';
export { formatDuration } from './format/format-duration/index.js';
export {
  buildThemeConfig,
  hasCompactAlgorithm,
  type BuildThemeConfigInput,
} from './theme/build-theme-config.js';
export * from './theme/ThemeProvider/index.js';
export * from './theme/ThemeToggle/index.js';
export * from './theme/ThemeFloatButton/index.js';

// ===== layout =====
export * from './layout/PageShell/index.js';
export * from './layout/SectionCard/index.js';
export * from './layout/Toolbar/index.js';
export * from './layout/PanelTabs/index.js';
export * from './layout/AppShell/index.js';
export * from './layout/SideNav/index.js';
export * from './layout/HudBar/index.js';
export * from './layout/NavBrand/index.js';
export * from './layout/SlotBoard/index.js';
export * from './layout/GraphCanvas/index.js';
export * from './layout/GraphCanvasLinks/index.js';
export * from './layout/GraphCanvasGrid/index.js';
// canvas 混合渲染版（canvas 画网格/连线 + DOM 放枢纽）：与 GraphCanvas 同语义、可换路线
export * from './layout/CanvasGraph/index.js';
// 纯 canvas 重做版（第一步：42×42 网格 + 坐标读数）：渲染无关的手感层尚未接入
export * from './layout/CanvasGrid/index.js';

// ===== pluggable =====
export * from './pluggable/panel-registry/index.js';

// ===== data =====
export * from './data/DataTable/index.js';
export * from './data/ResourceGrid/index.js';
export * from './data/KeyValueList/index.js';
export * from './data/StatItem/index.js';
export * from './data/StatGrid/index.js';
export * from './data/StatCompare/index.js';
export * from './data/PagedGrid/index.js';
export * from './data/DropPoolTable/index.js';

// ===== feedback =====
export * from './feedback/AsyncBoundary/index.js';
export * from './feedback/ErrorBoundary/index.js';
export * from './feedback/ConfirmAction/index.js';
export * from './feedback/SubmitButton/index.js';
export * from './feedback/PanelPlaceholder/index.js';
export * from './feedback/LockedHint/index.js';

// ===== form =====
export * from './form/TextField/index.js';
export * from './form/PasswordField/index.js';
export * from './form/NumberField/index.js';
export * from './form/SelectField/index.js';
export * from './form/SwitchField/index.js';
export * from './form/ActionForm/index.js';
export * from './form/ModalForm/index.js';

// ===== game =====
export * from './game/RarityTag/index.js';
export * from './game/ItemCard/index.js';
export * from './game/ResourceBar/index.js';
export * from './game/QuantityInput/index.js';
export * from './game/EmptyHint/index.js';
export * from './game/ActionBar/index.js';
export * from './game/SettlementSummary/index.js';
export * from './game/CraftOpPicker/index.js';
export * from './game/ItemPickerModal/index.js';
export * from './game/AffixList/index.js';
export * from './game/StoryTimeline/index.js';
export * from './game/LadderProgress/index.js';
