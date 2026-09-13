/**
 * 游戏域注册表（**可插拔核心**：导航分组 + 内容面板，同一份配置驱动）。
 *
 * 新增一个游戏域 = 在本文件加一项（`group` 决定落在哪个侧栏分组）；
 * **不需要**改 `GameShellPage`、也不需要 switch/if。
 *
 * `status`：
 * - `'ready'` —— 面板已按玩法实现，内容区渲染 `panel`；
 * - `'pending'` —— 面板待重做，内容区渲染 `PanelPlaceholder` 占位。
 * 旧版面板（DTO 字段罗列）已判定不合格；按「玩法驱动」逐个重做，做完把该项翻成 `ready` 并挂上 `panel`
 * —— **只改这一处**，页面壳与导航不需要动。当前进度：zone 已 `ready`，其余 10 个 `pending`。
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
import { ZonePanel } from './panels/ZonePanel.js';

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

/**
 * 侧栏分组定义（顺序即展示顺序）。
 *
 * 分组依据是**玩法因果链**，不是数据分类（见 `10-玩法驱动的面板设计.md` §2）：
 * - 修行：破境 → 参悟 → 换装，是「角色变强」的三件套；
 * - 器物：「选物 → 炼器」是连续动作，分家会逼玩家在两域间跳；
 * - 征伐：秘境是玩法主轴，**挂机是它的自动化**（`idle.settle` 缺省结算当前秘境当前层单位），
 *   战斗是它的数据图鉴——因此三者必须同组；
 * - 道途：任务与叙事同源（剧情节点由章节/任务对话派生）；
 * - 系统：设置。
 */
export const SIDE_NAV_GROUPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'cultivation', label: '修行' },
  { key: 'artifacts', label: '器物' },
  { key: 'campaign', label: '征伐' },
  { key: 'journey', label: '道途' },
  { key: 'system', label: '系统' },
];

const DOMAINS: readonly GameDomainEntry[] = [
  // 修行：破境 → 参悟 → 换装
  { key: 'realm', label: '境界', icon: <ThunderboltOutlined />, group: 'cultivation', status: 'pending',
    highlights: ['14 境进度轨与当前境', '突破消耗与差额', '突破后解锁的装备阶/秘境门槛'] },
  { key: 'skill', label: '功法', icon: <BookOutlined />, group: 'cultivation', status: 'pending',
    highlights: ['心法/术法槽位板', '神识预算占用条', '参悟消耗与等级上限'] },
  { key: 'equip', label: '装备', icon: <ToolOutlined />, group: 'cultivation', status: 'pending',
    highlights: ['10 槽位总览（含双戒指）', '换装前后属性对比', '阶数 vs 境界的门槛校验'] },
  // 器物：选物 → 炼器
  { key: 'bag', label: '背包', icon: <ShoppingOutlined />, group: 'artifacts', status: 'pending',
    highlights: ['按稀有度/阶数/品类筛选', '物品详情（词缀分阶着色）', '一键装备与丢弃'] },
  { key: 'economy', label: '通货·炼器', icon: <WalletOutlined />, group: 'artifacts', status: 'pending',
    highlights: ['通货与精华持有量', '14 种炼器操作（消耗与可用性）', '炼器前后词缀对比'] },
  // 征伐：秘境主轴 + 挂机自动化 + 战斗图鉴
  {
    key: 'zone',
    label: '秘境',
    icon: <CompassOutlined />,
    group: 'campaign',
    status: 'ready',
    panel: <ZonePanel />,
  },
  { key: 'idle', label: '挂机', icon: <ClockCircleOutlined />, group: 'campaign', status: 'pending',
    highlights: ['待结算时长与预计收益', '结算明细与日产出额度', '当前挂机秘境与层数'] },
  { key: 'combat', label: '战斗图鉴', icon: <FireOutlined />, group: 'campaign', status: 'pending',
    highlights: ['单位图鉴（阵营/境界/可否击杀）', '掉落池权重与概率', '辨宝法阵规则'] },
  // 道途：任务与叙事同源
  { key: 'quest', label: '任务', icon: <ProfileOutlined />, group: 'journey', status: 'pending',
    highlights: ['章节分组与任务卡', '目标进度实时评估', '一键同步发奖'] },
  { key: 'story', label: '剧情', icon: <ReadOutlined />, group: 'journey', status: 'pending',
    highlights: ['章节/任务剧本时间线', '未读/已读进度', '按节点标记已读'] },
  // 系统
  { key: 'settings', label: '设置', icon: <SettingOutlined />, group: 'system', status: 'pending',
    highlights: ['账号与角色信息', '主题与运行状态', '开发者工具（注入/生成装备）'] },
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
