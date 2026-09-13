/**
 * SkillPanel —— 功法图鉴 / 功法面板（skill 段）。
 *
 * 容器模式：上半概要用 `KeyValueList`，下半图鉴用 `DataTable`；参悟与开发注入是
 * 不可逆/资源消耗操作，用 `ConfirmAction` 二次确认。三态交给 `AsyncBoundary`。
 */
import { observer } from 'mobx-react-lite';
import { Button, Flex, Space } from 'antd';
import { useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { SkillCatalogView } from '@idle-path/ionet-transport';
import {
  AsyncBoundary,
  ConfirmAction,
  DataTable,
  KeyValueList,
  QuantityInput,
  SectionCard,
  Toolbar,
} from '@idle-path/ui-kit';
import type { KeyValueEntry } from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';

/** 图鉴列定义（纯展示；行操作由 `rowActions` 注入）。 */
const COLUMNS: ColumnsType<SkillCatalogView> = [
  { title: 'code', dataIndex: 'code', key: 'code' },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '类型', dataIndex: 'skillType', key: 'skillType' },
  { title: '道基', dataIndex: 'daoji', key: 'daoji' },
  { title: '神识', dataIndex: 'spiritCost', key: 'spiritCost' },
  {
    title: '修习',
    key: 'learned',
    render: (_value, entry) => (entry.learned ? '已修习' : '未修习'),
  },
  { title: '等级', key: 'level', render: (_value, entry) => entry.level ?? '—' },
];

export const SkillPanel = observer(function SkillPanel() {
  const root = useRootStore();
  const { skill } = root;
  const [lingyun, setLingyun] = useState<number | null>(1);

  const panel = skill.panel;
  const summary: KeyValueEntry[] = [
    { key: 'main', label: '主心法', value: panel?.xinfa.mainInfo?.name ?? panel?.xinfa.main ?? '空' },
    { key: 'aux', label: '辅心法', value: panel?.xinfa.aux.length ?? 0 },
    { key: 'shufa', label: '术法', value: panel?.shufa.length ?? 0 },
  ];

  return (
    <SectionCard
      title="功法"
      extra={
        <Button onClick={() => void skill.load()} data-testid="skill-refresh">
          刷新功法
        </Button>
      }
    >
      <AsyncBoundary
        loading={skill.loading}
        error={skill.error}
        empty={skill.catalog.length === 0}
        emptyText="暂无功法数据"
        onRetry={() => void skill.load()}
      >
        <Flex vertical gap={12}>
          <Flex data-testid="skill-panel-summary">
            <KeyValueList items={summary} column={3} bordered />
          </Flex>

          <DataTable<SkillCatalogView>
            columns={COLUMNS}
            dataSource={skill.catalog}
            rowKey="id"
            rowActions={(entry) => (
              <Space>
                {entry.learned ? null : (
                  <Button
                    onClick={() => void skill.learn(entry.id)}
                    data-testid={`skill-learn-${entry.id}`}
                  >
                    修习
                  </Button>
                )}
                <ConfirmAction
                  title={`确认参悟「${entry.name}」？`}
                  description="参悟消耗灵韵，提升该功法等级。"
                  onConfirm={() => skill.enlighten(entry.id)}
                >
                  <Button data-testid={`skill-enlighten-${entry.id}`}>参悟</Button>
                </ConfirmAction>
              </Space>
            )}
          />

          <Toolbar
            left={<span>注入灵韵（开发）</span>}
            right={
              <Space>
                <QuantityInput
                  value={lingyun ?? undefined}
                  onChange={setLingyun}
                  min={1}
                  max={1000000}
                />
                <ConfirmAction
                  title="确认注入灵韵？"
                  description="开发注入会直接改动灵韵余额。"
                  disabled={lingyun === null}
                  onConfirm={() => skill.grantLingyun(lingyun ?? 0)}
                >
                  <Button data-testid="skill-lingyun-grant" disabled={lingyun === null}>
                    注入灵韵
                  </Button>
                </ConfirmAction>
              </Space>
            }
          />
        </Flex>
      </AsyncBoundary>
    </SectionCard>
  );
});
