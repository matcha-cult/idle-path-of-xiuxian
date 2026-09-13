/**
 * ZonePanel —— 秘境（玩法主轴）。**新版样板**：按 `10-玩法驱动的面板设计.md` §1.6 重做。
 *
 * 玩家在这张面板上要回答三个问题（界面的三段结构也据此组织）：
 *   1. 我在哪、还差多少战力？→ `StatGrid` + `StatCompare`
 *   2. 现在能不能打？不能的话为什么？→ 挑战按钮的禁用态与原因提示
 *   3. 打到了什么？→ `SettlementSummary`（灵韵/掉落/分解/出售/弃置/卡阶）
 * 下方图鉴只回答「还有哪些秘境、怎么解锁、进哪个」。
 *
 * 协议字段一律不上屏（`code` 只做 key、`orderIndex` 只排序、`unitCode/bossCode` 不展示）。
 * 容器模式：不在挂载时拉取（首屏由 `loadPanel()` 并发加载）；三态交给 `AsyncBoundary`。
 * 子组件与展示判定拆在同目录 `zone/` 下（单文件规模与单一职责）。
 */
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { Button, Flex, Space, Tag, Tooltip, Typography } from 'antd';
import {
  AsyncBoundary,
  ConfirmAction,
  ResourceGrid,
  SectionCard,
  SettlementSummary,
  StatCompare,
  StatGrid,
  Toolbar,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { ZoneCard } from './zone/ZoneCard.js';
import { challengeBlockReason } from './zone/presentation.js';

export const ZonePanel = observer(function ZonePanel() {
  const root = useRootStore();
  const { zone, session } = root;
  const progress = zone.progress;
  const realm = session.character?.realm;
  const [selected, setSelected] = useState<string | undefined>(undefined);

  const lastChallenge = zone.lastChallenge;
  const blockReason =
    progress === null
      ? '尚未进入任何秘境'
      : challengeBlockReason({
          canChallenge: progress.canChallenge,
          cleared: progress.cleared,
          power: zone.playerPower,
          need: progress.floorRequirement,
        });

  return (
    <Flex vertical gap={12}>
      <SectionCard
        title={progress === null ? '秘境' : `${progress.currentZone.name} · 第 ${progress.floor} 层`}
        subtitle="挑战一层会结算该层单位的掉落与灵韵加成"
        extra={
          <Button onClick={() => void zone.load()} data-testid="zone-refresh">
            刷新秘境
          </Button>
        }
      >
        <AsyncBoundary
          loading={zone.loading}
          error={zone.error}
          empty={progress === null && zone.zones.length === 0}
          emptyText="暂无可用秘境"
          onRetry={() => void zone.load()}
        >
          <Flex vertical gap={12}>
            <div data-testid="zone-progress-stats">
              <StatGrid
                column={4}
                items={[
                  { key: 'floor', label: '当前层', value: progress?.floor ?? 0 },
                  { key: 'best', label: '最高层', value: progress?.bestFloor ?? 0 },
                  { key: 'power', label: '战力', value: zone.playerPower },
                  { key: 'need', label: '本层门槛', value: progress?.floorRequirement ?? 0 },
                ]}
              />
            </div>

            <div data-testid="zone-power-compare">
              <StatCompare
                label="战力对比"
                current={zone.playerPower}
                target={progress?.floorRequirement ?? 0}
                okText="可以挑战"
                failText="战力不足"
              />
            </div>

            {progress === null ? null : (
              <Space wrap data-testid="zone-floor-tags">
                {progress.isBossFloor ? <Tag color="gold">Boss 层</Tag> : null}
                {progress.lingyunBonus > 0 ? <Tag color="green">层灵韵 +{progress.lingyunBonus}</Tag> : null}
                {progress.dropTierOffset > 0 ? <Tag color="blue">掉落档 +{progress.dropTierOffset}</Tag> : null}
                {progress.extraDropDraws > 0 ? <Tag>额外掉落判定 +{progress.extraDropDraws}</Tag> : null}
                {progress.cleared ? <Tag color="success">已通关</Tag> : null}
              </Space>
            )}

            <Toolbar
              left={
                <Tooltip title={blockReason === '' ? undefined : blockReason}>
                  {/* 禁用按钮不触发鼠标事件，需包一层 span 才能显示浮层 */}
                  <span>
                    <ConfirmAction
                      title={`挑战「${progress?.currentZone.name ?? ''}」第 ${progress?.floor ?? 0} 层？`}
                      description="挑战会立即结算本层掉落与灵韵"
                      onConfirm={() => zone.challenge()}
                      disabled={progress === null || !progress.canChallenge}
                    >
                      <Button
                        type="primary"
                        disabled={progress === null || !progress.canChallenge}
                        data-testid="zone-challenge"
                      >
                        挑战本层
                      </Button>
                    </ConfirmAction>
                  </span>
                </Tooltip>
              }
              right={
                progress === null ? null : (
                  <Typography.Text type="secondary">
                    {progress.cleared ? '本秘境已通关' : '推进后下一层门槛将提高'}
                  </Typography.Text>
                )
              }
            />
          </Flex>
        </AsyncBoundary>
      </SectionCard>

      {lastChallenge === null ? null : (
        <div data-testid="zone-settlement">
          <SectionCard
            title="本次挑战结算"
            subtitle={`第 ${lastChallenge.floor} 层 → 第 ${lastChallenge.nextFloor} 层`}
          >
            <SettlementSummary
              lingyun={{ gained: lastChallenge.rewards.lingyunGained, total: lastChallenge.rewards.lingyunTotal }}
              kept={lastChallenge.rewards.kept}
              salvaged={lastChallenge.rewards.salvaged}
              sold={lastChallenge.rewards.sold}
              blockedByTier={lastChallenge.rewards.blockedByTier}
              resources={{ currencies: lastChallenge.rewards.currencies, essences: lastChallenge.rewards.essences }}
            />
          </SectionCard>
        </div>
      )}

      <SectionCard
        title="秘境图鉴"
        subtitle="解锁条件与推进进度"
        extra={
          <Typography.Text type="secondary" data-testid="zone-total">
            共 {zone.zones.length} 处
          </Typography.Text>
        }
      >
        <AsyncBoundary empty={zone.zones.length === 0} emptyText="暂无秘境" onRetry={() => void zone.load()}>
          <div data-testid="zone-list">
            <ResourceGrid
              items={zone.zones}
              span={8}
              keyOf={(entry) => entry.code}
              renderItem={(entry) => (
                <ZoneCard
                  zone={entry}
                  realm={realm}
                  current={entry.code === (progress?.currentZone.code ?? zone.currentZone)}
                  onEnter={(code) => {
                    setSelected(code);
                    void zone.enter(code);
                  }}
                />
              )}
            />
          </div>
        </AsyncBoundary>
      </SectionCard>
    </Flex>
  );
});
