/**
 * RarityTag —— 稀有度徽标（0..3 四档），游戏语义通用组。
 *
 * 用途：物品 / 灵石 / 功法等一切「稀有度」标记。
 * 约定：
 * - 颜色只用 antd `Tag` 的**预设色名**（`default|green|gold|red`），禁止内联 hex；
 * - 文案默认取 `RARITY_LABELS`，调用方可用 `labels` 整体覆盖；
 * - 组件不承载任何游戏数值/公式，稀有度由调用方传入。
 *
 * 插槽：无（纯展示）。
 * 边界：`rarity` 非有限数 / 负 / 小数 / 越界一律 clamp 到 0..3。
 */
import { Tag } from 'antd';

/** 四档稀有度的默认中文文案（`labels` 缺省时使用，也可整体覆盖）。 */
export const RARITY_LABELS = ['凡品', '灵品', '宝品', '传奇'] as const;

/** antd `Tag` 预设色名（与 0..3 档位一一对应；规划 09 §6.1 禁 hex）。 */
const RARITY_COLORS = ['default', 'green', 'gold', 'red'] as const;

/** clamp 后的合法档位下标。 */
type RarityIndex = 0 | 1 | 2 | 3;

const MAX_RARITY: RarityIndex = 3;

/**
 * 把任意入参夹取到 0..3：
 * NaN / Infinity / undefined / 非数字 → 0；小数先 `Math.trunc`；负数 → 0；超 3 → 3。
 */
function clampRarity(rarity: number): RarityIndex {
  const numeric = Number(rarity);
  if (!Number.isFinite(numeric)) return 0;
  const truncated = Math.trunc(numeric);
  if (truncated <= 0) return 0;
  if (truncated >= MAX_RARITY) return MAX_RARITY;
  return truncated as RarityIndex;
}

/** 取档位文案：`labels` 该位缺失（长度不足）时回退到 `RARITY_LABELS`。 */
function resolveLabel(labels: readonly string[] | undefined, index: RarityIndex): string {
  const custom = labels?.[index];
  if (custom !== undefined) return custom;
  return RARITY_LABELS[index] ?? RARITY_LABELS[0];
}

export interface RarityTagProps {
  /** 稀有度档位（约定 0..3，越界自动夹取）。 */
  rarity: number;
  /** 覆盖默认文案；长度不足 4 时缺失位回退 `RARITY_LABELS`。 */
  labels?: readonly string[];
  /** 是否显示档位文案，缺省 `true`；`false` 时只显示 `R1` 这类徽标。 */
  showLabel?: boolean;
  /** 透明转发给 antd `Tag`。 */
  bordered?: boolean;
}

export function RarityTag(props: RarityTagProps) {
  const { rarity, labels, showLabel = true, bordered } = props;
  const index = clampRarity(rarity);
  const color = RARITY_COLORS[index] ?? 'default';
  const text = showLabel ? resolveLabel(labels, index) : `R${index + 1}`;
  return (
    <Tag
      data-testid="rarity-tag"
      data-rarity={index}
      data-color={color}
      color={color}
      {...(bordered === undefined ? {} : { bordered })}
    >
      {text}
    </Tag>
  );
}
