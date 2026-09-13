/**
 * RealmPanel —— 境界状态与突破（realm 段）。
 *
 * 容器模式：`StatGrid` 展示当前境界 / 灵韵 / 下一境消耗，`ResourceBar` 展示灵韵进度；
 * 突破是不可逆操作，用 `ConfirmAction` 二次确认，封顶（`isMax`）时禁用触发。
 * 三态交给 `AsyncBoundary`，本面板不在挂载时自动拉取。
 * ⚠️ **旧版（M3 交付，已判定不合格）**：仅保留其测试以覆盖 store 契约；
 * 新版按「玩法驱动」重做后删除本文件（见 ai-docs/frontend-solution-exploration/10-玩法驱动的面板设计.md）。
 */
import { observer } from 'mobx-react-lite';
import { Button, Flex } from 'antd';
import { REALMS } from '@idle-path/ionet-transport';
import {
  AsyncBoundary,
  ConfirmAction,
  ResourceBar,
  SectionCard,
  StatGrid,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';

export const RealmPanel = observer(function RealmPanel() {
  const root = useRootStore();
  const { realm } = root;
  const status = realm.status;

  return (
    <SectionCard
      title="境界"
      extra={
        <Button onClick={() => void realm.load()} data-testid="realm-refresh">
          刷新境界
        </Button>
      }
    >
      <AsyncBoundary
        loading={realm.loading}
        error={realm.error}
        empty={status === null}
        emptyText="暂无境界数据"
        onRetry={() => void realm.load()}
      >
        {status === null ? null : (
          <Flex vertical gap={12}>
            <Flex data-testid="realm-stats">
              <StatGrid
                column={3}
                bordered
                items={[
                  {
                    key: 'realm',
                    label: '当前境界',
                    value: status.realmName,
                    suffix: `（第 ${status.realm} 境 / 共 ${REALMS.length} 境）`,
                  },
                  { key: 'lingyun', label: '灵韵', value: status.lingyun },
                  {
                    key: 'nextCost',
                    label: '下一境消耗',
                    value: status.isMax ? '已至封顶' : (status.nextCost ?? '—'),
                  },
                ]}
              />
            </Flex>

            <Flex data-testid="realm-lingyun-bar">
              <ResourceBar
                label="灵韵 / 下一境消耗"
                current={status.lingyun}
                max={status.nextCost ?? 0}
                suffix={`${status.lingyun} / ${status.nextCost ?? 0}`}
              />
            </Flex>

            <ConfirmAction
              title="确认突破境界？"
              description="突破消耗灵韵，且不可撤销。"
              danger
              disabled={status.isMax}
              onConfirm={() => realm.breakthrough()}
            >
              <Button type="primary" disabled={status.isMax} data-testid="realm-breakthrough">
                突破
              </Button>
            </ConfirmAction>
          </Flex>
        )}
      </AsyncBoundary>
    </SectionCard>
  );
});
