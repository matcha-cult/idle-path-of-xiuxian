/**
 * `RealmStoneSection` —— 「秘境石台」交互区（第八峰·后山）。
 *
 * 用户原话（§22 §1 Q1/Q3）：「进入地图后，有对象可以交互，可以选择突破秘境……
 * 与某个对象交互，选择突破的秘境进行突破，全都可突破，进去送人头都行。」
 *
 * 因此这里就是**宗门秘境的唯一入口**：石台上列出 13 境，点「突破」即进入在线战斗；
 * 打满整轮后该秘境出现在秘境页面（用户 Q4：未突破的不在秘境页面显示）。
 * 战斗进行时，下方复用秘境面板同一块实况组件（`ZoneOnlineSection`）。
 *
 * 容器只组装、不判定：准入与计数全部读服务端字段。
 */
import { Flex } from 'antd';
import type { ZoneBreakthroughView, ZoneOnlineData } from '@idle-path/ionet-transport';
import { SectionCard } from '@idle-path/ui-kit';
import { ZoneOnlineSection } from '../../zone/ZoneOnlineSection.js';
import { RealmBreakthroughList } from './RealmBreakthroughList.js';

export interface RealmStoneSectionProps {
  entries: readonly ZoneBreakthroughView[];
  /** 正在发起突破的秘境 code（其余行不 loading）。 */
  busyCode: string | null;
  /** 在线战斗实况（与秘境面板共用同一份服务端权威帧）。 */
  online: ZoneOnlineData | null;
  onBreakthrough: (code: string) => void;
  onRefreshOnline: () => void;
}

export function RealmStoneSection(props: RealmStoneSectionProps) {
  const { entries, busyCode, online, onBreakthrough, onRefreshOnline } = props;
  const cleared = entries.filter((entry) => entry.cleared).length;
  const free = entries.filter((entry) => entry.tierKind === 'training').length;

  return (
    <Flex vertical gap={12} data-testid="realm-stone-section">
      <SectionCard
        title="秘境石台"
        subtitle={`已突破 ${cleared} / ${entries.length} 处 · 免费历练秘境 ${free} 处随时可突破`}
      >
        <RealmBreakthroughList entries={entries} busyCode={busyCode} onBreakthrough={onBreakthrough} />
      </SectionCard>

      <ZoneOnlineSection frame={online} onRefresh={onRefreshOnline} />
    </Flex>
  );
}