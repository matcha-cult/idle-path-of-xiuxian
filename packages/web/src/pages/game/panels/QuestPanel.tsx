/**
 * QuestPanel —— 任务 / 章节（quest 段）。
 *
 * 模式（与 `BagPanel` 一致）：
 * - 本文件是**容器**：只做「store 状态 → ui-kit 通用组件 props」映射，不写业务规则；
 * - **不在挂载时自动拉取**：首屏由 `RootStore.loadPanel()` 统一并发加载；
 * - 视觉原语全部来自 `@idle-path/ui-kit` + antd：不写裸 div 布局、不写内联颜色、不传 `size`；
 * - 空/加载/错误三态交给 `AsyncBoundary`；补发同步是写操作，均用 `ConfirmAction` 二次确认。
 * ⚠️ **旧版（M3 交付，已判定不合格）**：仅保留其测试以覆盖 store 契约；
 * 新版按「玩法驱动」重做后删除本文件（见 ai-docs/frontend-solution-exploration/10-玩法驱动的面板设计.md）。
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
import type { QuestSyncData, QuestView } from '@idle-path/ionet-transport';
import { useRootStore } from '../../../app/root-context.js';

const columns: TableColumnsType<QuestView> = [
  { title: '编码', dataIndex: 'code', key: 'code' },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '状态', dataIndex: 'status', key: 'status' },
];

/** `lastSync` → 明细条目（纯字段映射）。 */
function syncItems(data: QuestSyncData) {
  return [
    { key: 'completedCount', label: '已完成任务', value: data.completedCount },
    { key: 'lingyun', label: '灵韵', value: data.totals.lingyun },
    { key: 'spiritStones', label: '灵石', value: data.totals.spiritStones },
    { key: 'jadeSlips', label: '玉简', value: data.totals.jadeSlips },
  ];
}

export const QuestPanel = observer(function QuestPanel() {
  const { quest } = useRootStore();

  return (
    <SectionCard
      title="任务"
      subtitle={`已完成 ${quest.completed} / 共 ${quest.total}`}
      extra={
        <Button onClick={() => void quest.load()} data-testid="quest-refresh">
          刷新任务
        </Button>
      }
    >
      <Flex vertical gap="middle">
        <StatGrid
          column={4}
          items={[
            {
              key: 'completed',
              label: <span data-testid="quest-stat-completed">已完成</span>,
              value: quest.completed,
            },
            { key: 'total', label: <span data-testid="quest-stat-total">总数</span>, value: quest.total },
            {
              key: 'chapters',
              label: <span data-testid="quest-stat-chapters">章节数</span>,
              value: quest.chapters.length,
            },
            {
              key: 'currentChapter',
              label: <span data-testid="quest-stat-current-chapter">当前章节</span>,
              value: quest.currentChapter === null ? '无' : quest.currentChapter,
            },
          ]}
        />

        <Toolbar
          left={
            <>
              <ConfirmAction
                title="同步任务奖励？"
                description="补发所有已完成但未领取的任务奖励"
                onConfirm={() => quest.sync()}
              >
                <Button type="primary" data-testid="quest-sync">
                  同步任务奖励
                </Button>
              </ConfirmAction>
              <ConfirmAction title="同步章节奖励？" onConfirm={() => quest.chapterSync()}>
                <Button data-testid="quest-chapter-sync">同步章节奖励</Button>
              </ConfirmAction>
            </>
          }
        />

        <AsyncBoundary
          loading={quest.loading}
          error={quest.error}
          empty={quest.quests.length === 0}
          emptyText="暂无任务"
          onRetry={() => void quest.load()}
        >
          <DataTable
            columns={columns}
            dataSource={quest.quests}
            rowKey="code"
            title="任务列表"
            emptyText="暂无任务"
            rowActions={(record) => (
              <Button
                onClick={() => void quest.detail(record.code)}
                data-testid={`quest-detail-${record.code}`}
              >
                详情
              </Button>
            )}
          />
        </AsyncBoundary>

        <Flex vertical data-testid="quest-last-sync">
          <KeyValueList
            title="最近同步"
            column={4}
            bordered
            emptyText="尚未同步"
            items={quest.lastSync === null ? [] : syncItems(quest.lastSync)}
          />
        </Flex>
      </Flex>
    </SectionCard>
  );
});
