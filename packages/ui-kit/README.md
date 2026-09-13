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
└── index.ts                      barrel：只导出公开组件与类型
```

## 主题决策（不要回退）

- **只有 `'light' | 'dark'` 两态**：不做 `'system'` 第三态，避免三态 + OS 事件 + 首帧竞态。
- **紧凑恒开**：`theme.compactAlgorithm` 永远在 algorithm 数组里；**不提供开关**
  （开关会导致布局错位与 PC/移动端双份适配成本）。因此组件级也不要再各自设 `size`。
- 主题色是**常量**（`DEFAULT_PRIMARY_COLOR`）；不提供 UI 选择器。将来要开放，只改此常量与选择器层。

## 用法

```tsx
import { ThemeProvider, ThemeToggle, buildThemeConfig } from '@idle-path/ui-kit';

<ThemeProvider mode={mode}>
  <ThemeToggle value={mode} onChange={setMode} />
  <App />
</ThemeProvider>
```

## 新增一个组件的步骤

1. 建目录 `src/<分组>/<Name>/`，写 `index.tsx`（导出 `Name` 与 `NameProps`）。
2. 同目录写 `index.test.tsx`：至少覆盖 正常渲染 / 空数据 / 边界（`undefined`/空数组/禁用）/
   交互回调 / 可访问性名称（`getByRole`）。
3. 在 `src/index.ts` 追加导出（组件与 props 类型）。
4. 若引入颜色，只能用 antd token（`theme.useToken()`）或既有语义 prop，不得写 hex。
5. 跑 `pnpm --filter @idle-path/ui-kit run test` 与 `run typecheck`。

## 验收

```bash
pnpm --filter @idle-path/ui-kit run typecheck
pnpm --filter @idle-path/ui-kit run test     # jsdom + RTL
pnpm --filter @idle-path/ui-kit run build    # tsc 产出 dist
```
