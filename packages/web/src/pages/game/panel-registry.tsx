/**
 * 游戏域面板注册表（**可插拔核心**）。
 *
 * 新增一个游戏域 = 新增 `panels/XxxPanel.tsx` + 在下方数组里加一项；
 * **不需要**改 `GameShellPage`、也不需要改任何 switch/if（规划 09 §3 T-D）。
 *
 * `order` 决定页签顺序（asc，同值按注册顺序稳定）。
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
import { createPanelRegistry, type PanelRegistry } from '@idle-path/ui-kit';
import { BagPanel } from './panels/BagPanel.js';
import { CombatPanel } from './panels/CombatPanel.js';
import { EconomyPanel } from './panels/EconomyPanel.js';
import { EquipPanel } from './panels/EquipPanel.js';
import { IdlePanel } from './panels/IdlePanel.js';
import { QuestPanel } from './panels/QuestPanel.js';
import { RealmPanel } from './panels/RealmPanel.js';
import { SettingsPanel } from './panels/SettingsPanel.js';
import { SkillPanel } from './panels/SkillPanel.js';
import { StoryPanel } from './panels/StoryPanel.js';
import { ZonePanel } from './panels/ZonePanel.js';

export function createGamePanelRegistry(): PanelRegistry {
  return createPanelRegistry([
    { key: 'bag', label: '背包', icon: <ShoppingOutlined />, order: 10, children: <BagPanel /> },
    { key: 'equip', label: '装备', icon: <ToolOutlined />, order: 20, children: <EquipPanel /> },
    { key: 'skill', label: '功法', icon: <BookOutlined />, order: 30, children: <SkillPanel /> },
    { key: 'realm', label: '境界', icon: <ThunderboltOutlined />, order: 40, children: <RealmPanel /> },
    { key: 'economy', label: '通货', icon: <WalletOutlined />, order: 50, children: <EconomyPanel /> },
    { key: 'zone', label: '秘境', icon: <CompassOutlined />, order: 60, children: <ZonePanel /> },
    { key: 'quest', label: '任务', icon: <ProfileOutlined />, order: 70, children: <QuestPanel /> },
    { key: 'combat', label: '战斗', icon: <FireOutlined />, order: 80, children: <CombatPanel /> },
    { key: 'story', label: '剧情', icon: <ReadOutlined />, order: 90, children: <StoryPanel /> },
    { key: 'idle', label: '挂机', icon: <ClockCircleOutlined />, order: 100, children: <IdlePanel /> },
    { key: 'settings', label: '设置', icon: <SettingOutlined />, order: 999, children: <SettingsPanel /> },
  ]);
}
