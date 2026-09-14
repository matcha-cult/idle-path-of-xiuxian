/**
 * `RealmBreakthroughList` —— 13 境突破名录（按 realm 升序，服务端已排好序）。
 *
 * 只做「列出 + 转发点击」：准入判定（`canBreakthrough`）由服务端给、行内展示由
 * `RealmBreakthroughRow` 负责，本组件不重复任何规则。
 */
import { Flex, Typography } from 'antd';
import type { ZoneBreakthroughView } from '@idle-path/ionet-transport';
import { RealmBreakthroughRow } from './RealmBreakthroughRow.js';

export interface RealmBreakthroughListProps {
  entries: readonly ZoneBreakthroughView[];
  /** 正在发起突破的秘境 code（其余行不 loading）。 */
  busyCode: string | null;
  onBreakthrough: (code: string) => void;
}

export function RealmBreakthroughList(props: RealmBreakthroughListProps) {
  const { entries, busyCode, onBreakthrough } = props;

  if (entries.length === 0) {
    return (
      <Typography.Text type="secondary" data-testid="realm-breakthrough-empty">
        暂无可突破的秘境。
      </Typography.Text>
    );
  }

  return (
    <Flex vertical gap={8} data-testid="realm-breakthrough-list">
      {entries.map((entry) => (
        <RealmBreakthroughRow
          key={entry.code}
          entry={entry}
          busy={busyCode === entry.code}
          onBreakthrough={onBreakthrough}
        />
      ))}
    </Flex>
  );
}