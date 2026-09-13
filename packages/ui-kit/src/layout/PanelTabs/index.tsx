/**
 * PanelTabs —— **config 驱动**的面板容器（可插拔入口）。
 *
 * 与「一个面板一个 if 分支」相反：调用方把 `PanelTabItem[]`（一般来自 `createPanelRegistry().list()`）
 * 传进来，本组件只做字段映射，**不存在**任何 `switch`/`if` 选择内容的逻辑——
 * 面板正文由 `items[].children` 提供，因此新增面板无需改动渲染层。
 *
 * 受控性：传 `activeKey` 即受控（切页只回调 `onChange`，不自行改态）；
 * 不传则用 antd 的非受控模式（内部态，`defaultActiveKey` 指定初值，缺省激活第一项）。
 * 若受控 `activeKey` 指向已不存在的 key，antd 会自动回落到第一个可用页签。
 *
 * 边界：`items=[]` 时渲染空容器（无页签、无内容），不抛错；
 * `children` 缺省的项其内容区为空；`disabled` 项不可点击、不可键盘激活。
 */
import { Tabs } from 'antd';
import type { PanelTabItem } from '../../pluggable/panel-registry/index.js';

export interface PanelTabsProps {
  /** 面板配置（来自 panel-registry 或任意调用方）。 */
  items: PanelTabItem[];
  /** 受控激活 key；传入即为受控模式。 */
  activeKey?: string;
  /** 非受控模式的初始激活 key；缺省激活第一项。 */
  defaultActiveKey?: string;
  /** 页签切换回调（受控/非受控均触发）。 */
  onChange?: (key: string) => void;
  /** 是否在页签隐藏时销毁其内容（antd v6 `destroyOnHidden`）。 */
  destroyOnHidden?: boolean;
  /** 页签是否居中。 */
  centered?: boolean;
}

export function PanelTabs(props: PanelTabsProps) {
  const { items, activeKey, defaultActiveKey, onChange, destroyOnHidden, centered } = props;
  return (
    <Tabs
      data-testid="panel-tabs-root"
      items={items.map((item) => ({
        key: item.key,
        label: item.label,
        icon: item.icon,
        disabled: item.disabled,
        children: item.children,
      }))}
      activeKey={activeKey}
      defaultActiveKey={defaultActiveKey}
      onChange={onChange}
      destroyOnHidden={destroyOnHidden}
      centered={centered}
    />
  );
}
