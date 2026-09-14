/**
 * ZonePanel —— 秘境（§22 重做：**只列已突破的秘境**）。
 *
 * 玩家在这张面板上回答三个问题：
 *   1. 我现在打着吗、打到哪了？→ `ZoneOnlineSection`（服务端权威帧）
 *   2. 这一轮打得动吗？→ `StatCompare`（战力 vs 本层门槛）+ 卡层提示
 *   3. 我有哪些秘境可以再打？→ 下方「已突破秘境」卡列表（未突破的**不显示**，用户 Q4）
 *
 * §23 ①：每张卡多一个「设为挂机点」快捷入口（特殊秘境禁用）；挂机点的**统一管理**
 * 在挂机面板（`IdlePanel` → `IdleTargetBar` / `IdleTargetPicker`），这里只做就地快捷设置。
 *
 * 未突破的秘境不在这里出现 —— 它们只在地图的「第八峰·后山 → 秘境石台」处被发现与突破，
 * 突破成功（在线打满整轮）后才会出现在本面板。
 *
 * 协议字段一律不上屏（`code` 只做 key、`orderIndex` 只排序、`unitCode/bossCode` 不展示）。
 * 容器模式：不在挂载时拉取（首屏由 `loadPanel()` 并发加载）；三态交给 `AsyncBoundary`。
 * 子组件与展示判定拆在同目录 `zone/` 下（单文件规模与单一职责）。
 */
import { observer } from 'mobx-react-lite';
import { Alert, Button, Flex, Space, Tag, Typography } from 'antd';
import { AsyncBoundary, ResourceGrid, SectionCard, StatCompare, StatGrid, Toolbar } from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { ZoneCard } from './zone/ZoneCard.js';
import { ZoneOnlineSection } from './zone/ZoneOnlineSection.js';
import { idleTargetName } from './zone/presentation.js';

export const ZonePanel = observer(function ZonePanel() {
  const root = useRootStore();
  const { zone } = root;
  const progress = zone.progress;
  const idleTargetLabel = idleTargetName(zone.idleTarget, zone.zones, zone.breakthrough);

  return (
    <Flex vertical gap={12}>
      {/* §22：在线战斗实况（帧全部来自服务端，客户端不本地推进） */}
      <ZoneOnlineSection frame={zone.online} onRefresh={() => void zone.loadOnline()} />

      <SectionCard
        title={progress === null ? '当前战斗' : `${progress.currentZone.name} · 第 ${progress.floor} 层`}
        subtitle={progress === null ? '未在秘境中：到地图「第八峰·后山」的秘境石台突破' : '打满整轮即突破'}
        extra={
          <Button onClick={() => void zone.load()} data-testid="zone-refresh">
            刷新秘境
          </Button>
        }
      >
        <AsyncBoundary
          loading={zone.loading}
          error={zone.error}
          onRetry={() => void zone.load()}
        >
          {progress === null ? (
            <Alert
              type="info"
              showIcon
              title="当前没有进行中的战斗：到地图上的「秘境石台」选择秘境突破，或在下方列表里重复挑战已突破的秘境"
            />
          ) : (
            <Flex vertical gap={12}>
              <div data-testid="zone-progress-stats">
                <StatGrid
                  items={[
                    { key: 'floor', label: '当前层', value: progress.floor },
                    { key: 'best', label: '最高层', value: progress.bestFloor },
                    { key: 'clears', label: '已通关', value: `${progress.clears} 轮` },
                    { key: 'need', label: '本层门槛', value: progress.floorRequirement },
                  ]}
                />
              </div>

              <div data-testid="zone-power-compare">
                <StatCompare
                  label="战力对比"
                  current={zone.playerPower}
                  target={progress.floorRequirement}
                  okText="打得动"
                  failText="战力不足"
                />
              </div>

              <Space wrap data-testid="zone-floor-tags">
                {progress.isBossFloor ? <Tag color="gold">Boss 层</Tag> : null}
                {progress.lingyunBonus > 0 ? <Tag color="green">层灵韵 +{progress.lingyunBonus}</Tag> : null}
                {progress.dropTierOffset > 0 ? <Tag color="blue">掉落档 +{progress.dropTierOffset}</Tag> : null}
                {progress.extraDropDraws > 0 ? <Tag>额外掉落判定 +{progress.extraDropDraws}</Tag> : null}
              </Space>

              <Toolbar
                left={
                  <Button danger onClick={() => void zone.leave()} data-testid="zone-leave">
                    离开秘境
                  </Button>
                }
                right={<Typography.Text type="secondary">在线战斗期间离线挂机暂停，离开后恢复</Typography.Text>}
              />
            </Flex>
          )}
        </AsyncBoundary>
      </SectionCard>

      <SectionCard
        title="已突破秘境"
        subtitle="未突破的秘境不在此显示；到地图的秘境石台突破后即出现"
        extra={
          <Typography.Text type="secondary" data-testid="zone-total">
            共 {zone.zones.length} 处
          </Typography.Text>
        }
      >
        {idleTargetLabel === null ? null : (
          <div data-testid="zone-idle-target">
            <Typography.Text type="secondary">当前挂机点：{idleTargetLabel}</Typography.Text>
          </div>
        )}
        <AsyncBoundary empty={zone.zones.length === 0} emptyText="尚未突破任何秘境" onRetry={() => void zone.load()}>
          <div data-testid="zone-list">
            <ResourceGrid
              items={zone.zones}
              span={8}
              keyOf={(entry) => entry.code}
              renderItem={(entry) => (
                <ZoneCard
                  zone={entry}
                  current={entry.code === zone.currentZone}
                  isIdleTarget={entry.code === zone.idleTarget}
                  idleBusy={zone.busyZoneCode === entry.code}
                  onEnter={(code) => void zone.enter(code)}
                  onSetIdleTarget={(code) => void zone.setIdleTarget(code)}
                />
              )}
            />
          </div>
        </AsyncBoundary>
      </SectionCard>
    </Flex>
  );
});
