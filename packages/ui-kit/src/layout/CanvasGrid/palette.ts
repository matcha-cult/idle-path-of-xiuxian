/**
 * `CanvasGrid` 的**调色板**：把 antd token 编译成 canvas 能直接吃的字符串。
 *
 * 为什么不直接写颜色：ui-kit 的红线门禁（`test/hygiene.test.ts` 规则 2）禁止内联 hex，
 * 且 canvas **不认 CSS 变量**（`ctx.fillStyle = 'var(--x)'` 是静默无效）——
 * 因此必须由 `theme.useToken()` 取到真值再传进来。明暗主题切换时 token 变 → 重画。
 *
 * 这一层被单独拆出来，是为了让绘制函数（`paint-grid` / `paint-cursor-label`）只依赖
 * 普通字符串，从而可以用一个「记录调用的假上下文」单测，不必装原生 canvas 包。
 */

/** 绘制层真正需要的最小色集。 */
export interface GridPalette {
  /** 画布底色 */
  background: string;
  /** 细格线 */
  minor: string;
  /** 主线（每 `majorStep` 格一条 + 两端） */
  major: string;
  /** 悬停格强调色 */
  accent: string;
  /** 轴标文字 */
  axisText: string;
  /**
   * **内容标记**（主峰 / 功能峰 / 以后的四院四门）。
   *
   * 刻意与 `accent`（悬停高亮）用不同色系：一眼要能分清「这是地图内容」和「这是鼠标的位置」。
   */
  mark: string;
  /**
   * **参考圆 / 轨道**（功能点所在的环）。
   *
   * 第四种颜色：网格线（border 系）· 悬停（primary）· 功能点（warning）· 轨道（success）。
   * 层数越叠越多，四种颜色的分工就必须一次定清，否则上屏是一团谁也认不出的线。
   */
  guide: string;
}

/** 从 antd global token 里取色（结构类型，便于测试直接喂假 token）。 */
export interface GridPaletteSource {
  colorBgContainer: string;
  colorBorderSecondary: string;
  colorBorder: string;
  colorPrimary: string;
  colorTextTertiary: string;
  colorWarning: string;
  colorSuccess: string;
}

export function gridPalette(source: GridPaletteSource): GridPalette {
  return {
    background: source.colorBgContainer,
    minor: source.colorBorderSecondary,
    major: source.colorBorder,
    accent: source.colorPrimary,
    axisText: source.colorTextTertiary,
    mark: source.colorWarning,
    guide: source.colorSuccess,
  };
}
