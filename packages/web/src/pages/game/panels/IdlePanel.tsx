/**
 * IdlePanel —— 离线挂机（idle 段）。
 *
 * 容器模式（与 BagPanel 一致）：只做「store 状态 → ui-kit 组件 props」映射，不写业务规则；
 * 不在挂载时自动拉取；三态交给 `AsyncBoundary`；结算属不可逆操作，用 `ConfirmAction` 二次确认。
 * ⚠️ **旧版（M3 交付，已判定不合格）**：仅保留其测试以覆盖 store 契约；
 * 新版按「玩法驱动」重做后删除本文件（见 ai-docs/frontend-solution-exploration/10-玩法驱动的面板设计.md）。
 */
import { observer } from 'mobx-react-lite';
import { Button, Flex } from 'antd';
import {
  AsyncBoundary,
  ConfirmAction,
  KeyValueList,
  ResourceBar,
  SectionCard,
  StatGrid,
  Toolbar,
  type KeyValueEntry,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';

export const IdlePanel = observer(function IdlePanel() {
  const { idle } = useRootStore();
  const status = idle.status;
  const lastSettle = idle.lastSettle;

  const settleItems: KeyValueEntry[] =
    lastSettle === null
      ? []
      : [
          {
            key: 'unit',
            label: '结算单位',
            value: lastSettle.unit === null ? '无可结算' : lastSettle.unit.name,
          },
          { key: 'offlineHours', label: '离线时长', value: `${lastSettle.offlineHours} 小时` },
          { key: 'kills', label: '击杀', value: lastSettle.kills },
          { key: 'lingyunGained', label: '灵韵收益', value: lastSettle.lingyunGained },
          { key: 'itemsProduced', label: '产出物品', value: lastSettle.itemsProduced },
        ];

  return (
    <SectionCard
      title="离线挂机"
      subtitle={status === null ? '未加载挂机状态' : `境界 ${status.realm} · 上次结算 ${status.lastSettleAt}`}
      extra={
        <Button onClick={() => void idle.load()} data-testid="idle-refresh">
          刷新挂机
        </Button>
      }
    >
      <Toolbar
        left={<span data-testid="idle-config">效率 {status?.config.efficiencyPct ?? 0}%</span>}
        right={
          <ConfirmAction
            title="确认结算离线收益？"
            description="结算后离线时长将重新起算，该操作不可撤销。"
            okText="确认结算"
            onConfirm={() => idle.settle({})}
          >
            <Button type="primary" data-testid="idle-settle">
              结算离线收益
            </Button>
          </ConfirmAction>
        }
      />

      <AsyncBoundary
        loading={idle.loading}
        error={idle.error}
        empty={status === null && lastSettle === null}
        emptyText="暂无挂机数据"
        onRetry={() => void idle.load()}
      >
        <Flex vertical gap={12}>
          {status === null ? null : (
            <Flex vertical gap={12}>
              <StatGrid
                column={4}
                items={[
                  { key: 'pendingHours', label: '待结算时长', value: status.pendingHours, suffix: ' 小时' },
                  { key: 'effectiveHours', label: '有效时长', value: status.effectiveHours, suffix: ' 小时' },
                  { key: 'estimatedKills', label: '预计击杀', value: status.estimatedKills },
                  { key: 'estimatedLingyun', label: '预计灵韵', value: status.estimatedLingyun },
                ]}
              />
              <ResourceBar
                label="今日物品产出"
                current={status.dailyItemsProduced}
                max={status.dailyItemCap}
                suffix={`${status.dailyItemsProduced}/${status.dailyItemCap}`}
              />
            </Flex>
          )}
          {lastSettle === null ? null : (
            <KeyValueList bordered column={2} title="最近结算" items={settleItems} />
          )}
        </Flex>
      </AsyncBoundary>
    </SectionCard>
  );
});
