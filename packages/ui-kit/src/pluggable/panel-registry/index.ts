/**
 * panel-registry —— 面板注册表（**纯 TS，无 React 运行时依赖**）。
 *
 * 定位：`PanelTabs` 的「可插拔」数据源。注册方（业务页面 / 插件）只描述
 * 「有哪些面板、顺序如何、内容节点是什么」，`PanelTabs` 只负责把 `list()` 的结果
 * 映射成 antd `Tabs` 的 `items`——组件内**不存在** switch/if 选择分支，
 * 因此新增面板无需改动渲染层（规划 09 「可插拔」硬约束）。
 *
 * 设计要点：
 * - 唯一性：`key` 是主键，重复注册直接抛错（快速失败，避免静默覆盖）；
 * - 顺序：`list()` 按 `order` 升序（缺省 0）稳定排序，同 `order` 保持注册先后；
 * - 不可变：`list()` 返回**新数组快照**，外部增删改不影响内部状态；
 * - 无副作用：不读写全局变量、不 import 任何业务/store/传输层。
 *
 * 注意：本模块只 `import type { ReactNode }`（编译期擦除），因此产物里没有 React import。
 */
import type { ReactNode } from 'react';

/** 单个面板描述：`PanelTabs` 的 `items` 元素。 */
export interface PanelTabItem {
  /** 稳定唯一键（非空、非纯空白），重复注册会抛错。 */
  key: string;
  /** 页签名（可为字符串或任意节点）。 */
  label: ReactNode;
  /** 页签图标（可选）。 */
  icon?: ReactNode;
  /** 排序权重，缺省 0；升序，同值按注册顺序稳定排列。 */
  order?: number;
  /** 禁用态：不可点击、不可聚焦到激活。 */
  disabled?: boolean;
  /** 面板内容节点；缺省时该页签内容为空。 */
  children?: ReactNode;
}

/** 面板注册表：注册 / 注销 / 查询 / 快照列举。 */
export interface PanelRegistry {
  /** 注册一个面板；`key` 非法或重复时抛 `Error`。 */
  register(item: PanelTabItem): void;
  /** 注销：存在则删除并返回 `true`，不存在返回 `false`（不抛错）。 */
  unregister(key: string): boolean;
  /** 是否存在该 key。 */
  has(key: string): boolean;
  /** 取面板（不存在返回 `undefined`）。 */
  get(key: string): PanelTabItem | undefined;
  /** 批量注册：**先整体校验再写入**，任一 key 非法/重复则整体不生效。 */
  registerAll(items: readonly PanelTabItem[]): void;
  /** 排序后的新数组快照（外部修改不影响内部）。 */
  list(): PanelTabItem[];
  /** 当前面板数量。 */
  readonly size: number;
  /** 清空全部注册。 */
  clear(): void;
}

/** 排序权重：缺省 0（统一在此收敛，避免各处重复 `?? 0`）。 */
function orderOf(item: PanelTabItem): number {
  return item.order ?? 0;
}

/** 校验 key：必须是非空、非纯空白字符串。 */
function assertValidKey(item: PanelTabItem): string {
  const key: string | undefined = item?.key;
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('panel-registry: key 必须是非空且非纯空白的字符串');
  }
  return key;
}

/**
 * 创建独立的面板注册表（每次调用一份隔离状态，便于测试与多实例场景）。
 *
 * @param initial 初始面板列表（可选）；内部等价于先 `registerAll(initial)`。
 */
export function createPanelRegistry(initial?: readonly PanelTabItem[]): PanelRegistry {
  /** `Map` 天然保留插入顺序，用作「注册顺序」的稳定 tiebreak。 */
  const store = new Map<string, PanelTabItem>();

  const doRegister = (item: PanelTabItem): void => {
    const key = assertValidKey(item);
    if (store.has(key)) {
      throw new Error(`panel-registry: 重复注册 key="${key}"`);
    }
    store.set(key, item);
  };

  const registry: PanelRegistry = {
    register(item: PanelTabItem): void {
      doRegister(item);
    },

    unregister(key: string): boolean {
      return store.delete(key);
    },

    has(key: string): boolean {
      return store.has(key);
    },

    get(key: string): PanelTabItem | undefined {
      return store.get(key);
    },

    registerAll(items: readonly PanelTabItem[]): void {
      // 两阶段提交：先校验全部（含批内重复），再统一写入，避免「注册到一半」的脏状态。
      const pending: PanelTabItem[] = [];
      const seen = new Set<string>();
      for (const item of items) {
        const key = assertValidKey(item);
        if (store.has(key) || seen.has(key)) {
          throw new Error(`panel-registry: 重复注册 key="${key}"`);
        }
        seen.add(key);
        pending.push(item);
      }
      for (const item of pending) {
        store.set(item.key, item);
      }
    },

    list(): PanelTabItem[] {
      return Array.from(store.values())
        .map((item, index) => ({ item, index }))
        .sort((a, b) => orderOf(a.item) - orderOf(b.item) || a.index - b.index)
        .map((entry) => entry.item);
    },

    get size(): number {
      return store.size;
    },

    clear(): void {
      store.clear();
    },
  };

  if (initial !== undefined) {
    registry.registerAll(initial);
  }

  return registry;
}
