/**
 * QuestPanel —— 任务与章节（道途线）。**新版**：按 `10-玩法驱动的面板设计.md` §1.7 重做。
 *
 * 玩家在这张面板上要回答三个问题（界面三段结构据此组织）：
 *   1. 现在该做什么、还差多少？→ 概览 `StatGrid` + 任务卡的目标进度
 *   2. 能做什么？→「一键结算」依次补发已完成的任务与章节奖励（幂等，可重复点）
 *   3. 做完得到什么？→ 最近结算 `SettlementSummary` + 奖励明细 `KeyValueList`
 * 章节区用 `LockedHint` 回答「后面还有什么、差什么才能解锁」。
 *
 * 协议字段不上屏（`code` 只做 key、`orderIndex` 只排序、`status`/`objectives[].type`
 * 一律映射中文）。容器模式：不在挂载时拉取（首屏由 `loadPanel()` 并发加载）；三态交给
 * `AsyncBoundary`；分页是纯 UI 状态（store 不持有 page，故本地切片）。
 */
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { Button, Flex, Typography } from 'antd';
import type { CurrencyView, EssenceView, QuestSyncData } from '@idle-path/ionet-transport';
import {
  AsyncBoundary,
  ConfirmAction,
  KeyValueList,
  PagedGrid,
  ResourceGrid,
  SectionCard,
  SettlementSummary,
  StatGrid,
  Toolbar,
  type KeyValueEntry,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { formatCompactNumber } from '../../../domain/format.js';
import { ChapterCard } from './quest/ChapterCard.js';
import { QuestCard } from './quest/QuestCard.js';
import { chapterProgressText, claimableCount, sortQuests } from './quest/presentation.js';

/** 本地分页每页任务数（`PagedGrid` 受控，切片由本面板负责）。 */
const PAGE_SIZE = 6;

/** 通货/精华 code → 中文名；查不到给占位文案，**绝不把协议 code 打到屏幕上**。 */
function resourceNameOf(currencies: readonly CurrencyView[], essences: readonly EssenceView[]) {
  const names = new Map<string, string>();
  for (const entry of [...currencies, ...essences]) names.set(entry.code, entry.name);
  return (code: string): string => names.get(code) ?? '未知奖励';
}

/** 最近结算的奖励明细（任务数 / 发放条目 / 灵石 / 玉简）。 */
function syncEntries(last: QuestSyncData): KeyValueEntry[] {
  return [
    { key: 'completedCount', label: '已结算任务', value: formatCompactNumber(last.completedCount) },
    { key: 'granted', label: '发放条目', value: formatCompactNumber(last.granted.length) },
    { key: 'spiritStones', label: '灵石', value: formatCompactNumber(last.totals.spiritStones) },
    { key: 'jadeSlips', label: '玉简', value: formatCompactNumber(last.totals.jadeSlips) },
  ];
}

export const QuestPanel = observer(function QuestPanel() {
  const root = useRootStore();
  const { quest, session, economy } = root;
  const [page, setPage] = useState(1);

  const quests = sortQuests(quest.quests);
  // `PagedGrid` 不自行纠正越界页码，这里按当前条数收敛，避免数据变少后停在空页。
  const pageCount = Math.max(1, Math.ceil(quests.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pageQuests = quests.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const lastSync = quest.lastSync;
  const realm = session.character?.realm;

  /** 一键结算：先补发任务奖励，再补发章节奖励（两者均幂等）。 */
  async function settleAll(): Promise<void> {
    await quest.sync();
    await quest.chapterSync();
  }

  return (
    <Flex vertical gap={12}>
      <SectionCard
        title="任务"
        subtitle={`已完成 ${formatCompactNumber(quest.completed)} / 共 ${formatCompactNumber(quest.total)}`}
        extra={
          <Button onClick={() => void quest.load()} data-testid="quest-refresh">
            刷新任务
          </Button>
        }
      >
        <AsyncBoundary
          loading={quest.loading}
          error={quest.error}
          empty={quests.length === 0}
          emptyText="暂无任务，先去秘境历练"
          onRetry={() => void quest.load()}
        >
          <Flex vertical gap={12}>
            <div data-testid="quest-stats">
              <StatGrid
                items={[
                  { key: 'completed', label: '已完成', value: formatCompactNumber(quest.completed) },
                  { key: 'claimable', label: '可结算', value: formatCompactNumber(claimableCount(quests)) },
                  {
                    key: 'currentChapter',
                    label: '当前章节',
                    value: quest.currentChapter === null ? '—' : `第 ${quest.currentChapter} 章`,
                  },
                  { key: 'chapters', label: '章节进度', value: chapterProgressText(quest.chapters) },
                ]}
              />
            </div>

            <Toolbar
              left={
                <ConfirmAction
                  title="一键结算任务与章节奖励？"
                  description="会依次结算已完成的任务与章节奖励；重复结算不会重复发奖。"
                  okText="结算"
                  onConfirm={settleAll}
                >
                  <Button type="primary" data-testid="quest-sync-all">
                    一键结算
                  </Button>
                </ConfirmAction>
              }
              right={
                <Typography.Text type="secondary">目标由服务端实时评估，达成后即可结算</Typography.Text>
              }
            />

            <div data-testid="quest-list">
              <PagedGrid
                items={pageQuests}
                span={8}
                keyOf={(item) => item.code}
                page={safePage}
                pageSize={PAGE_SIZE}
                total={quests.length}
                onPageChange={(next) => setPage(next)}
                emptyText="暂无任务"
                renderItem={(item) => <QuestCard quest={item} />}
              />
            </div>
          </Flex>
        </AsyncBoundary>
      </SectionCard>

      <SectionCard title="章节" subtitle="章节解锁条件与任务进度">
        <AsyncBoundary
          empty={quest.chapters.length === 0}
          emptyText="暂无章节数据"
          onRetry={() => void quest.load()}
        >
          <div data-testid="chapter-list">
            <ResourceGrid
              items={quest.chapters}
              span={8}
              keyOf={(item) => item.code}
              renderItem={(item) => (
                <ChapterCard
                  chapter={item}
                  chapters={quest.chapters}
                  current={item.chapter === quest.currentChapter}
                  realm={realm}
                />
              )}
            />
          </div>
        </AsyncBoundary>
      </SectionCard>

      {lastSync === null ? null : (
        <div data-testid="quest-settlement">
          <SectionCard
            title="最近结算"
            subtitle={`本次发放 ${formatCompactNumber(lastSync.granted.length)} 项奖励`}
          >
            <Flex vertical gap={12}>
              <SettlementSummary
                lingyun={{ gained: lastSync.totals.lingyun }}
                kept={0}
                resources={{ currencies: lastSync.totals.currencies, essences: lastSync.totals.essences }}
                nameOf={resourceNameOf(economy.currencies, economy.essences)}
              />
              <div data-testid="quest-settlement-extra">
                <KeyValueList column={{ xs: 1, sm: 2, lg: 4 }} items={syncEntries(lastSync)} />
              </div>
            </Flex>
          </SectionCard>
        </div>
      )}
    </Flex>
  );
});
