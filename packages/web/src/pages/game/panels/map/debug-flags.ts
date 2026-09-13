/**
 * 地图画布的**开发者调试开关**（纯前端；后端与协议零参与）。
 *
 * 规格来源：`14-地图画布方案探讨.md` §13.1 + `19-...任务书.md` §7。网格是**渲染调试信息**，
 * 不是游戏数据 —— 让后端下发会把「正式服不渲染」变成「后端要记得不下发」，多一条可能出错的路径。
 *
 * 优先级：**URL 参数 > 缺省关**
 * - `?mapGrid=1` → 开（调坐标时显式打开；正式环境排查也能临时打开）；
 * - `?mapGrid=0` → 关（显式关，等价于缺省）；
 * - 无参数 / 非法值 → **关**（不再跟随 `import.meta.env.DEV`）。
 *
 * 为什么缺省改成关（用户实测反馈）：它是**调坐标用的调试工具**，平时开着满屏点阵很吵；
 * 而且它的轴标文字（`0 1 2 3 … 20`）正是拖动时被浏览器原生选中的那串数字。
 * 改成缺省关后**开发服与正式服行为一致**，调坐标时加个参数即可。
 *
 * `env` 与 `search` 都是**显式入参**（不在这里读 `import.meta` / `location`），
 * 于是这条规则可以不依赖浏览器环境单测。
 */

export interface MapDebugEnv {
  /** 构建模式：`import.meta.env.DEV`。**已不参与缺省判定**（保留入参是为了兼容调用方与测试）。 */
  DEV?: boolean;
}

export interface MapDebugFlags {
  /** 是否在画布上叠加网格 / 轴标 / 每个枢纽的 `(行,列)`。 */
  showGrid: boolean;
}

/** URL 参数名（正式环境排查用同一个名字，便于口头传达）。 */
export const MAP_GRID_PARAM = 'mapGrid';

/**
 * 解析调试开关。
 *
 * 边界：`search` 以 `?` 开头或不带都接受；重复参数取**第一个**（与 `URLSearchParams.get` 一致）；
 * 空串 / 非法值（如 `?mapGrid=x`）回退到**关**，绝不抛错。
 */
export function resolveMapDebug(_env: MapDebugEnv, search: string): MapDebugFlags {
  const value = readParam(search, MAP_GRID_PARAM);
  if (value === '1') return { showGrid: true };
  return { showGrid: false };
}

/**
 * 读一个查询参数；`search` 非法（不是字符串 / 无法解析）时视为不存在。
 * 只接受**完整值** `1` 或 `0`：`x` / `true` / 空串都按「没传」处理，回退构建模式。
 */
function readParam(search: string, name: string): string | null {
  if (typeof search !== 'string') return null;
  try {
    return new URLSearchParams(search).get(name);
  } catch {
    return null;
  }
}
