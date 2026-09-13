/**
 * CombatPanel —— 单位图鉴 / 掉落表（combat 段）。
 *
 * 模式（与 `BagPanel` 一致）：
 * - 本文件是**容器**：只做「store 状态 → ui-kit 通用组件 props」映射，不写业务规则；
 * - **不在挂载时自动拉取**：首屏由 `RootStore.loadPanel()` 统一并发加载；
 * - 视觉原语全部来自 `@idle-path/ui-kit` + antd：不写裸 div 布局、不写内联颜色、不传 `size`；
 * - 空/加载/错误三态交给 `AsyncBoundary`；击杀是破坏性操作，用 `ConfirmAction` 二次确认。
 * ⚠️ **旧版（M3 交付，已判定不合格）**：仅保留其测试以覆盖 store 契约；
 * 新版按「玩法驱动」重做后删除本文件（见 ai-docs/frontend-solution-exploration/10-玩法驱动的面板设计.md）。
 */
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Flex } from 'antd';
import type { TableColumnsType } from 'antd';
import {
  AsyncBoundary,
  ConfirmAction,
  DataTable,
  QuantityInput,
  SectionCard,
  Toolbar,
} from '@idle-path/ui-kit';
import type { DropTableView, UnitCatalogView } from '@idle-path/ionet-transport';
import { useRootStore } from '../../../app/root-context.js';

const unitColumns: TableColumnsType<UnitCatalogView> = [
  { title: '编码', dataIndex: 'code', key: 'code' },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '阵营', dataIndex: 'camp', key: 'camp' },
  { title: '境界', dataIndex: 'realmName', key: 'realmName' },
];

const dropColumns: TableColumnsType<DropTableView> = [
  { title: '编码', dataIndex: 'code', key: 'code' },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '条目数', key: 'entries', render: (_value, record) => record.entries.length },
  { title: '每次掉落', dataIndex: 'dropsPerKill', key: 'dropsPerKill' },
];

/** 击杀数量区间（协议 `KillUnitInput.count` 为 1..50）。 */
const KILL_COUNT_MIN = 1;
const KILL_COUNT_MAX = 50;

export const CombatPanel = observer(function CombatPanel() {
  const { combat } = useRootStore();
  const [killCount, setKillCount] = useState(KILL_COUNT_MIN);

  return (
    <SectionCard
      title="战斗图鉴"
      subtitle={`单位 ${combat.total} 种 · 掉落表 ${combat.dropTables.length} 张`}
      extra={
        <Button onClick={() => void combat.load()} data-testid="combat-refresh">
          刷新图鉴
        </Button>
      }
    >
      <Flex vertical gap="middle">
        <Toolbar
          left={
            <Flex align="center" gap="small" data-testid="combat-kill-count">
              <span>击杀数量</span>
              <QuantityInput
                value={killCount}
                min={KILL_COUNT_MIN}
                max={KILL_COUNT_MAX}
                onChange={(next) => setKillCount(next ?? KILL_COUNT_MIN)}
              />
            </Flex>
          }
        />

        <AsyncBoundary
          loading={combat.loading}
          error={combat.error}
          empty={combat.units.length === 0 && combat.dropTables.length === 0}
          emptyText="暂无图鉴数据"
          onRetry={() => void combat.load()}
        >
          <Flex vertical gap="middle">
            <DataTable
              columns={unitColumns}
              dataSource={combat.units}
              rowKey="code"
              title="单位图鉴"
              emptyText="暂无单位"
              rowActions={(record) => (
                <>
                  <Button
                    onClick={() => void combat.spawn({ code: record.code })}
                    data-testid={`combat-spawn-${record.code}`}
                  >
                    生成
                  </Button>
                  <ConfirmAction
                    title={`击杀「${record.name}」×${killCount}？`}
                    danger
                    onConfirm={() => combat.kill({ code: record.code, count: killCount })}
                  >
                    <Button danger data-testid={`combat-kill-${record.code}`}>
                      击杀
                    </Button>
                  </ConfirmAction>
                </>
              )}
            />
            <DataTable
              columns={dropColumns}
              dataSource={combat.dropTables}
              rowKey="code"
              title="掉落表"
              emptyText="暂无掉落表"
            />
          </Flex>
        </AsyncBoundary>
      </Flex>
    </SectionCard>
  );
});
