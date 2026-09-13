/**
 * ActionBar —— 可插拔动作条：`ActionDescriptor[]` → 按钮 + 溢出菜单，游戏语义通用组。
 *
 * 用途：把「一排操作」（修炼/突破/采集/出售…）从写死的 JSX 收敛为**描述对象数组**，
 *       便于按上下文动态组装、按权限 `hidden`/`disabled`、并自动折叠溢出。
 * 约定：
 * - 纯渲染：`onClick` 的副作用由调用方承担（可返回 Promise，组件只触发不等待）；
 * - `confirm` 非空时必须二次确认（antd `Popconfirm`）才会调用 `onClick`；
 * - 不跨组依赖（不使用 feedback 组组件），文案/图标全部由 props 注入。
 *
 * 插槽：无（动作即数据）。
 * 边界：`actions=[]` 渲染空容器不抛错；全部 `hidden` 时不渲染「更多」；
 *       `max <= 0` 时全部进溢出菜单；`loadingKey` 命中时该按钮 `loading` 且 `disabled`。
 */
import { Button, Dropdown, Popconfirm, Space } from 'antd';
import type { ReactNode } from 'react';

/** 单个动作的描述对象（M3 依赖的契约，字段名逐字固定）。 */
export interface ActionDescriptor {
  /** 稳定唯一键，用于 React key 与 `loadingKey` 匹配。 */
  key: string;
  /** 按钮文案。 */
  label: ReactNode;
  /** 按钮图标。 */
  icon?: ReactNode;
  /** 危险动作（红）。 */
  danger?: boolean;
  /** 禁用（不触发 `onClick`）。 */
  disabled?: boolean;
  /** `true` 时既不渲染按钮，也不进溢出菜单。 */
  hidden?: boolean;
  /** 非空时需二次确认（`Popconfirm`）才执行。 */
  confirm?: { title: ReactNode; description?: ReactNode };
  /** 触发回调；允许返回 Promise，组件不等待（loading 由 `loadingKey` 表达）。 */
  onClick: () => void | Promise<void>;
}

export interface ActionBarProps {
  /** 动作描述数组（按数组顺序渲染，前 `max` 个直出，其余进「更多」）。 */
  actions: readonly ActionDescriptor[];
  /** 直出按钮上限，缺省 3；`<= 0` 时全部进溢出菜单。 */
  max?: number;
  /** 该 key 对应的动作显示 loading（同时 disabled）。 */
  loadingKey?: string;
}

const DEFAULT_MAX = 3;

/** `max` 归一：非有限数回退默认；负数按 0（全部溢出）处理。 */
function normalizeMax(max: number | undefined): number {
  if (max === undefined) return DEFAULT_MAX;
  const numeric = Number(max);
  if (!Number.isFinite(numeric)) return DEFAULT_MAX;
  return Math.max(0, Math.trunc(numeric));
}

export function ActionBar(props: ActionBarProps) {
  const { actions, max, loadingKey } = props;
  const limit = normalizeMax(max);
  const visible = actions.filter((action) => action.hidden !== true);
  const inline = visible.slice(0, limit);
  const overflow = visible.slice(limit);

  return (
    <Space data-testid="action-bar-root" wrap>
      {inline.map((action) => {
        const loading = loadingKey !== undefined && loadingKey === action.key;
        const button = (
          <Button
            key={action.key}
            data-testid={`action-${action.key}`}
            icon={action.icon}
            danger={action.danger}
            disabled={action.disabled === true || loading}
            loading={loading}
            onClick={action.confirm === undefined ? () => void action.onClick() : undefined}
          >
            {action.label}
          </Button>
        );
        if (action.confirm === undefined) return button;
        return (
          <Popconfirm
            key={action.key}
            title={action.confirm.title}
            description={action.confirm.description}
            onConfirm={() => void action.onClick()}
          >
            {button}
          </Popconfirm>
        );
      })}
      {overflow.length > 0 ? (
        <Dropdown
          key="__overflow__"
          trigger={['click']}
          menu={{
            items: overflow.map((action) => ({
              key: action.key,
              label: action.label,
              icon: action.icon,
              danger: action.danger,
              disabled: action.disabled,
              onClick: () => void action.onClick(),
            })),
          }}
        >
          <Button data-testid="action-bar-more">更多</Button>
        </Dropdown>
      ) : null}
    </Space>
  );
}
