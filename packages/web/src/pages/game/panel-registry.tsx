/**
 * 游戏域注册表（**可插拔核心**：导航分组 + 内容面板，同一份配置驱动）。
 *
 * 新增一个游戏域 = 在本文件加一项（`group` 决定落在哪个侧栏分组）；
 * **不需要**改 `GameShellPage`、也不需要 switch/if。
 *
 * `status`：
 * - `'ready'` —— 面板已按玩法实现，内容区渲染 `children`；
 * - `'pending'` —— 面板待重做，内容区渲染 `PanelPlaceholder` 占位。
 * 当前 11 个域全部处于 `pending`（旧版面板只是 DTO 字段罗列，已判定不合格；
 * 新版按「玩法驱动」逐个重做后把 status 翻成 `ready` —— 只改这一处）。
 */
import {
  BookOutlined,
  ClockCircleOutlined,
  CompassOutlined,
  FireOutlined,
  ProfileOutlined,
  ReadOutlined,
  SettingOutlined,
  ShoppingOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { PanelPlaceholder, type SideNavGroup } from '@idle-path/ui-kit';
import type { ReactNode } from 'react';

export type GameDomainKey =
  | 'bag'
  | 'equip'
  | 'skill'
  | 'realm'
  | 'economy'
  | 'zone'
  | 'quest'
  | 'combat'
  | 'story'
  | 'idle'
  | 'settings';

export type PanelStatus = 'ready' | 'pending';

export interface GameDomainEntry {
  key: GameDomainKey;
  label: string;
  icon: ReactNode;
  /** 侧栏分组（见 `SIDE_NAV_GROUPS`）。 */
  group: string;
  status: PanelStatus;
  /** `status==='ready'` 时渲染的面板。 */
  panel?: ReactNode;
  /** `status==='pending'` 时占位卡片要强调的要点（纯文案）。 */
  highlights?: readonly string[];
}

/** 侧栏分组定义（顺序即展示顺序）。 */
export const SIDE_NAV_GROUPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'growth', label: '养成' },
  { key: 'resource', label: '资源' },
  { key: 'battle', label: '战斗' },
  { key: 'adventure', label: '冒险' },
  { key: 'system', label: '系统' },
];

const DOMAINS: readonly GameDomainEntry[] = [
  { key: 'bag', label: '背包', icon: <ShoppingOutlined />, group: 'growth', status: 'pending' },
  { key: 'equip', label: '装备', icon: <ToolOutlined />, group: 'growth', status: 'pending' },
  { key: 'skill', label: '功法', icon: <BookOutlined />, group: 'growth', status: 'pending' },
  { key: 'realm', label: '境界', icon: <ThunderboltOutlined />, group: 'growth', status: 'pending' },
  { key: 'economy', label: '通货', icon: <WalletOutlined />, group: 'resource', status: 'pending' },
  { key: 'idle', label: '挂机', icon: <ClockCircleOutlined />, group: 'resource', status: 'pending' },
  { key: 'combat', label: '战斗', icon: <FireOutlined />, group: 'battle', status: 'pending' },
  { key: 'zone', label: '秘境', icon: <CompassOutlined />, group: 'battle', status: 'pending' },
  { key: 'quest', label: '任务', icon: <ProfileOutlined />, group: 'adventure', status: 'pending' },
  { key: 'story', label: '剧情', icon: <ReadOutlined />, group: 'adventure', status: 'pending' },
  { key: 'settings', label: '设置', icon: <SettingOutlined />, group: 'system', status: 'pending' },
];

/** 取全部域（只读快照）。 */
export function listGameDomains(): readonly GameDomainEntry[] {
  return DOMAINS;
}

export function getGameDomain(key: string): GameDomainEntry | undefined {
  return DOMAINS.find((domain) => domain.key === key);
}

/** 侧栏导航配置（按分组聚合，空分组不渲染）。 */
export function createGamePanelGroups(): SideNavGroup[] {
  return SIDE_NAV_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    items: DOMAINS.filter((domain) => domain.group === group.key).map((domain) => ({
      key: domain.key,
      label: domain.label,
      icon: domain.icon,
    })),
  })).filter((group) => group.items.length > 0);
}

/** 内容区节点：`ready` 渲染面板，`pending` 渲染占位。 */
export function renderGameDomainContent(key: string): ReactNode {
  const domain = getGameDomain(key);
  if (domain === undefined) return null;
  if (domain.status === 'ready' && domain.panel !== undefined) return domain.panel;
  return (
    <PanelPlaceholder
      title={domain.label}
      {...(domain.highlights === undefined ? {} : { highlights: domain.highlights })}
    />
  );
}

/** 全部域的 key（供测试与默认选中）。 */
export function listGameDomainKeys(): string[] {
  return DOMAINS.map((domain) => domain.key);
}
