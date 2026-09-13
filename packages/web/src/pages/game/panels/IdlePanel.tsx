/**
 * IdlePanel —— 挂机与离线收益（秘境主轴的自动化）。**新版**：按 `10-玩法驱动的面板设计.md` §1.10 重做。
 *
 * 玩家在这张面板上要回答三个问题（界面三段结构据此组织）：
 *   1. 离线攒了多少、能换多少？→ `StatGrid`（待结算/有效时长、预计击杀/灵韵）
 *   2. 今天还能掉多少件？→ `ResourceBar`（日产出额度）+ 挂机规则 `KeyValueList`
 *   3. 收了什么？→ `SettlementSummary`（含「无可结算」空分支）
 *
 * 后端**没有 `serverTime`**，`pendingHours` 由服务端算好，因此面板**不做本地每秒倒计时**。
 * 协议字段不上屏（`lastSettleAt` 的 ISO 原文、`dailyItemsProduced` 等字段名、通货 code 都不展示）。
 * 容器模式：不在挂载时拉取（首屏由 `loadPanel()` 并发加载）；三态交给 `AsyncBoundary`。
 */
import { observer } from 'mobx-react-lite';
import { Button, Flex, Typography } from 'antd';
import type {
  CurrencyView,
  EssenceView,
  IdleSettleResultData,
  IdleStatusData,
} from '@idle-path/ionet-transport';
import {
  AsyncBoundary,
  ConfirmAction,
  KeyValueList,
  ResourceBar,
  SectionCard,
  SettlementSummary,
  StatGrid,
  Toolbar,
  formatDuration,
  type KeyValueEntry,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { formatCompactNumber } from '../../../domain/format.js';

/** 挂机规则（取自服务端 `config`，只翻译成玩家语言，不新增规则）。 */
function ruleEntries(config: IdleStatusData['config']): KeyValueEntry[] {
  const perRoundHours = config.roundsPerHour > 0 ? 1 / config.roundsPerHour : Number.NaN;
  return [
    {
      key: 'pace',
      label: '结算节奏',
      value: config.roundsPerHour > 0 ? `每轮 ${formatDuration(perRoundHours)}` : '—',
    },
    { key: 'efficiency', label: '挂机效率', value: `${formatCompactNumber(config.efficiencyPct)}%` },
    { key: 'cap', label: '离线封顶', value: formatDuration(config.maxOfflineHours) },
  ];
}

/** 结算明细（结算秘境 / 离线时长 / 有效时长 / 今日产出）。 */
function settleEntries(last: IdleSettleResultData): KeyValueEntry[] {
  const zoneName = 'zone' in last && last.zone !== null ? last.zone.name : null;
  return [
    { key: 'zone', label: '结算秘境', value: zoneName ?? '—' },
    { key: 'offline', label: '离线时长', value: formatDuration(last.offlineHours) },
    { key: 'effective', label: '有效时长', value: formatDuration(last.effectiveHours) },
    {
      key: 'daily',
      label: '今日物品产出',
      value: `${formatCompactNumber(last.dailyItemsProduced)} / ${formatCompactNumber(last.dailyItemCap)}`,
    },
  ];
}

/** 结算标题：空分支（`unit===null`）明确说明「没有可结算收益」，不当作错误。 */
function settleSubtitle(last: IdleSettleResultData): string {
  if (last.unit === null) return `离线 ${formatDuration(last.offlineHours)} · 暂无可结算收益`;
  return `${last.unit.name} · 击杀 ${formatCompactNumber(last.kills)}`;
}

/** 通货/精华 code → 中文名；查不到时给占位文案，**绝不把协议 code 打到屏幕上**。 */
function resourceNameOf(currencies: readonly CurrencyView[], essences: readonly EssenceView[]) {
  const names = new Map<string, string>();
  for (const entry of [...currencies, ...essences]) names.set(entry.code, entry.name);
  return (code: string): string => names.get(code) ?? '未知掉落';
}

export const IdlePanel = observer(function IdlePanel() {
  const root = useRootStore();
  const { idle, economy } = root;
  const status = idle.status;
  const last = idle.lastSettle;

  return (
    <Flex vertical gap={12}>
      <SectionCard
        title="挂机"
        subtitle="离线期间按效率自动结算当前秘境；回来一键收取"
        extra={
          <Button onClick={() => void idle.load()} data-testid="idle-refresh">
            刷新挂机
          </Button>
        }
      >
        <AsyncBoundary
          loading={idle.loading}
          error={idle.error}
          empty={status === null && last === null}
          emptyText="暂无挂机数据"
          onRetry={() => void idle.load()}
        >
          <Flex vertical gap={12}>
            {status === null ? null : (
              <Flex vertical gap={12}>
                <div data-testid="idle-stats">
                  <StatGrid
                    items={[
                      { key: 'pending', label: '待结算时长', value: formatDuration(status.pendingHours) },
                      { key: 'effective', label: '有效时长', value: formatDuration(status.effectiveHours) },
                      { key: 'kills', label: '预计击杀', value: formatCompactNumber(status.estimatedKills) },
                      { key: 'lingyun', label: '预计灵韵', value: formatCompactNumber(status.estimatedLingyun) },
                    ]}
                  />
                </div>

                <div data-testid="idle-daily-bar">
                  <ResourceBar
                    label="今日物品产出额度"
                    current={status.dailyItemsProduced}
                    max={status.dailyItemCap}
                    suffix={`${formatCompactNumber(status.dailyItemsProduced)} / ${formatCompactNumber(status.dailyItemCap)}`}
                  />
                </div>

                <div data-testid="idle-rules">
                  <KeyValueList column={{ xs: 1, sm: 2, md: 3 }} items={ruleEntries(status.config)} />
                </div>
              </Flex>
            )}

            <Toolbar
              left={
                status === null ? null : (
                  <Typography.Text type="secondary">
                    {status.pendingHours > 0
                      ? `已攒下 ${formatDuration(status.pendingHours)} 的离线收益`
                      : '暂无可结算收益'}
                  </Typography.Text>
                )
              }
              right={
                <ConfirmAction
                  title="结算离线收益？"
                  description="结算后离线时长重新起算，该操作不可撤销。"
                  okText="确认结算"
                  onConfirm={() => idle.settle({})}
                >
                  <Button type="primary" data-testid="idle-settle">
                    结算离线收益
                  </Button>
                </ConfirmAction>
              }
            />

            {last === null ? null : (
              <div data-testid="idle-settlement">
                <SectionCard title="最近一次结算" subtitle={settleSubtitle(last)}>
                  <Flex vertical gap={12}>
                    {last.unit === null ? (
                      <Typography.Text type="secondary" data-testid="idle-settlement-empty">
                        这段时间没有可结算的收益，新收益会继续累积
                      </Typography.Text>
                    ) : null}
                    <KeyValueList column={{ xs: 1, sm: 2 }} items={settleEntries(last)} />
                    <SettlementSummary
                      lingyun={{ gained: last.lingyunGained, total: last.lingyunTotal }}
                      kept={last.kept}
                      salvaged={last.salvaged}
                      sold={last.sold}
                      discarded={last.discarded}
                      blockedByTier={last.blockedByTier}
                      resources={{ currencies: last.currencies, essences: last.essences }}
                      nameOf={resourceNameOf(economy.currencies, economy.essences)}
                    />
                  </Flex>
                </SectionCard>
              </div>
            )}
          </Flex>
        </AsyncBoundary>
      </SectionCard>
    </Flex>
  );
});
