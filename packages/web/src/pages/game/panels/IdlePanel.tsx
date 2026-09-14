/**
 * IdlePanel —— 挂机与离线收益（秘境主轴的自动化）。按 `10-玩法驱动的面板设计.md` §1.10 重做。
 *
 * 玩家在这张面板上要回答三个问题（界面三段结构据此组织）：
 *   1. 离线攒了多少、能换多少？→ `StatGrid`（待结算/有效时长、预计击杀/灵韵）
 *   2. 今天还能掉多少件？→ `ResourceBar`（日产出额度）+ 挂机规则 `KeyValueList`
 *   3. 收了什么？→ `SettlementDetail`（逐层战果 + 汇总，含「无可结算」空分支）
 *
 * 后端**没有 `serverTime`**，`pendingHours` 由服务端算好，因此面板**不做本地每秒倒计时**。
 * 协议字段不上屏（`lastSettleAt` 的 ISO 原文、`dailyItemsProduced` 等字段名、通货 code 都不展示）。
 * 展示判定（规则文案 / 结算文案 / 逐层清单 / 通货译名）全在 `idle/presentation.ts`，本文件只做装配。
 * 容器模式：不在挂载时拉取（首屏由 `loadPanel()` 并发加载）；三态交给 `AsyncBoundary`。
 */
import { observer } from 'mobx-react-lite';
import { Button, Flex, Typography } from 'antd';
import {
  AsyncBoundary,
  ConfirmAction,
  KeyValueList,
  ResourceBar,
  SectionCard,
  StatGrid,
  Toolbar,
  formatDuration,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { formatCompactNumber } from '../../../domain/format.js';
import { SettlementDetail } from './idle/SettlementDetail.js';
import { idleRuleEntries } from './idle/presentation.js';

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
                  <KeyValueList column={{ xs: 1, sm: 2, md: 3 }} items={idleRuleEntries(status.config)} />
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
              <SettlementDetail last={last} currencies={economy.currencies} essences={economy.essences} />
            )}
          </Flex>
        </AsyncBoundary>
      </SectionCard>
    </Flex>
  );
});
