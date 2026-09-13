/**
 * ZonePanel —— 秘境（zone 段）。
 *
 * 模式（与 `BagPanel` 一致）：
 * - 本文件是**容器**：只做「store 状态 → ui-kit 通用组件 props」映射，不写业务规则；
 * - **不在挂载时自动拉取**：首屏由 `RootStore.loadPanel()` 统一并发加载；
 * - 视觉原语全部来自 `@idle-path/ui-kit` + antd：不写裸 div 布局、不写内联颜色、不传 `size`；
 * - 空/加载/错误三态交给 `AsyncBoundary`；进入 / 挑战是破坏性操作，均用 `ConfirmAction` 二次确认。
 */
import { observer } from 'mobx-react-lite';
import { Button, Flex } from 'antd';
import type { TableColumnsType } from 'antd';
import {
  AsyncBoundary,
  ConfirmAction,
  DataTable,
  KeyValueList,
  SectionCard,
  StatGrid,
  Toolbar,
} from '@idle-path/ui-kit';
import type { ZoneChallengeData, ZoneView } from '@idle-path/ionet-transport';
import { useRootStore } from '../../../app/root-context.js';

const columns: TableColumnsType<ZoneView> = [
  { title: '编码', dataIndex: 'code', key: 'code' },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '章节', dataIndex: 'chapter', key: 'chapter' },
  { title: '最低境界', dataIndex: 'minRealm', key: 'minRealm' },
  {
    title: '已解锁',
    dataIndex: 'unlocked',
    key: 'unlocked',
    render: (unlocked: boolean) => (unlocked ? '是' : '否'),
  },
  {
    title: '进度',
    key: 'progress',
    render: (_value, record) => `${record.progress?.bestFloor ?? 0}/${record.maxFloor}`,
  },
];

/** `lastChallenge` → 明细条目（纯字段映射）。 */
function challengeItems(data: ZoneChallengeData) {
  return [
    { key: 'zone', label: '秘境', value: data.zone.name },
    { key: 'floor', label: '层数', value: `${data.floor} → ${data.nextFloor}` },
    { key: 'lingyun', label: '灵韵', value: data.rewards.lingyunGained },
    { key: 'kept', label: '保留物品', value: data.rewards.kept },
  ];
}

export const ZonePanel = observer(function ZonePanel() {
  const { zone } = useRootStore();
  const progress = zone.progress;

  return (
    <SectionCard
      title="秘境"
      subtitle={
        progress === null ? '尚未进入秘境' : `${progress.currentZone.name} · 第 ${progress.floor} 层`
      }
      extra={
        <Button onClick={() => void zone.load()} data-testid="zone-refresh">
          刷新秘境
        </Button>
      }
    >
      <Flex vertical gap="middle">
        <StatGrid
          column={3}
          items={[
            {
              key: 'power',
              label: <span data-testid="zone-stat-power">战力</span>,
              value: zone.playerPower,
            },
            {
              key: 'current',
              label: <span data-testid="zone-stat-current">当前秘境</span>,
              value: progress === null ? '未进入' : progress.currentZone.name,
            },
            {
              key: 'floor',
              label: <span data-testid="zone-stat-floor">层数</span>,
              value: progress === null ? 0 : progress.floor,
            },
          ]}
        />

        <Toolbar
          left={
            <ConfirmAction
              title="挑战当前层？"
              description="挑战会与当前层单位战斗并结算奖励"
              onConfirm={() => zone.challenge()}
            >
              <Button type="primary" data-testid="zone-challenge">
                挑战当前层
              </Button>
            </ConfirmAction>
          }
        />

        <AsyncBoundary
          loading={zone.loading}
          error={zone.error}
          empty={zone.zones.length === 0}
          emptyText="还没有可去的秘境"
          onRetry={() => void zone.load()}
        >
          <DataTable
            columns={columns}
            dataSource={zone.zones}
            rowKey="code"
            title="秘境列表"
            emptyText="还没有可去的秘境"
            rowActions={(record) => (
              <ConfirmAction
                title={`进入「${record.name}」？`}
                disabled={!record.unlocked}
                onConfirm={() => zone.enter(record.code)}
              >
                <Button disabled={!record.unlocked} data-testid={`zone-enter-${record.code}`}>
                  进入
                </Button>
              </ConfirmAction>
            )}
          />
        </AsyncBoundary>

        <Flex vertical data-testid="zone-last-challenge">
          <KeyValueList
            title="最近挑战"
            column={4}
            bordered
            emptyText="尚未挑战"
            items={zone.lastChallenge === null ? [] : challengeItems(zone.lastChallenge)}
          />
        </Flex>
      </Flex>
    </SectionCard>
  );
});
