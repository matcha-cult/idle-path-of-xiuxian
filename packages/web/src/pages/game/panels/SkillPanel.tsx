/**
 * SkillPanel —— 功法（修行线）。**新版**：按 `10-玩法驱动的面板设计.md` §1.3 重做。
 *
 * 玩家在这张面板上要回答三个问题（界面三段结构据此组织）：
 *   1. 我的道基流派搭成什么样了？→ 主心法 / 道基 / 辅心法数 / 术法数 + 神识预算条
 *   2. 怎么调整这九槽？→「调整功法面板」编辑器（整组替换：主 1 / 辅 ≤3 / 术法 ≤5）
 *   3. 功法从哪来、怎么变强？→ 功法册卡片上的「修习 / 参悟」
 *
 * 实现真相（`10-...md` §4-6）：道基协同目前只是**占位提示**，不参与战斗结算，
 * 因此面板只显示「同流派术法 N 门」，绝不把「+20%」当作真实加成展示。
 * 协议字段不上屏（`code/id` 只做 key、`skillType` 映射中文、`school`/`growth_rate` 不展示）。
 * 容器模式：不在挂载时拉取（首屏由 `loadPanel()` 并发加载）；三态交给 `AsyncBoundary`。
 */
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { Button, Flex, Space, Tag, Typography } from 'antd';
import { PANEL_LIMITS } from '@idle-path/ionet-transport';
import {
  AsyncBoundary,
  ConfirmAction,
  LockedHint,
  ModalForm,
  QuantityInput,
  ResourceBar,
  SectionCard,
  SlotBoard,
  StatGrid,
  Toolbar,
  type SlotBoardItem,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { SkillCatalogSection } from './skill/CatalogSection.js';
import {
  composerFields,
  composerInitialValues,
  composerInput,
  shufaSlotSummaries,
  spiritText,
  synergySummary,
  xinfaSlotSummaries,
  type SkillSlotSummary,
} from './skill/presentation.js';

/** 槽位摘要 → SlotBoard 单元格（纯展示映射，空槽交给 `empty`）。 */
function toSlot(summary: SkillSlotSummary): SlotBoardItem {
  return {
    key: summary.key,
    label: summary.label,
    empty: '空槽',
    item:
      summary.name === null ? undefined : (
        <Flex vertical gap={2}>
          <Typography.Text strong>{summary.name}</Typography.Text>
          {summary.meta === null ? null : <Typography.Text type="secondary">{summary.meta}</Typography.Text>}
          {summary.matched ? <Tag color="processing">道基协同</Tag> : null}
        </Flex>
      ),
  };
}

export const SkillPanel = observer(function SkillPanel() {
  const root = useRootStore();
  const { skill, session } = root;
  const [editing, setEditing] = useState(false);
  const [lingyun, setLingyun] = useState<number | null>(1);

  const panel = skill.panel;
  const catalog = skill.catalog;
  const spiritUsed = panel?.spiritUsed ?? 0;
  const spiritBudget = panel?.spiritBudget ?? 0;
  const synergy = synergySummary(panel);
  const jadeSlips = session.character?.jadeSlips ?? null;

  return (
    <Flex vertical gap={12}>
      <SectionCard
        title="功法面板"
        subtitle={`九槽构筑：主心法 1 · 辅心法 ≤${PANEL_LIMITS.aux} · 术法 ≤${PANEL_LIMITS.shufa}；神识预算只由辅心法占用`}
        extra={
          <Button onClick={() => void skill.load()} data-testid="skill-refresh">
            刷新功法
          </Button>
        }
      >
        <AsyncBoundary
          loading={skill.loading}
          error={skill.error}
          empty={panel === null && catalog.length === 0}
          emptyText="暂无功法数据"
          onRetry={() => void skill.load()}
        >
          <Flex vertical gap={12}>
            <div data-testid="skill-overview">
              <StatGrid
                items={[
                  { key: 'main', label: '主心法', value: panel?.xinfa.mainInfo?.name ?? '未配置' },
                  { key: 'daoji', label: '道基流派', value: panel?.mainDaoji ?? '未定' },
                  { key: 'aux', label: '辅心法', value: `${panel?.xinfa.aux.length ?? 0} / ${PANEL_LIMITS.aux}` },
                  { key: 'shufa', label: '术法', value: `${panel?.shufa.length ?? 0} / ${PANEL_LIMITS.shufa}` },
                ]}
              />
            </div>

            <div data-testid="skill-spirit-bar">
              <ResourceBar
                label="神识预算（仅辅心法计入）"
                current={spiritUsed}
                max={spiritBudget}
                suffix={spiritText(spiritUsed, spiritBudget)}
              />
            </div>

            <Space wrap data-testid="skill-synergy-summary">
              <Tag color="processing">
                同流派术法 {synergy.matched} / {synergy.total}
              </Tag>
              <Typography.Text type="secondary">道基协同当前只是提示，加成尚未参与战斗结算</Typography.Text>
            </Space>

            {panel === null || panel.xinfa.main !== null ? null : (
              <div data-testid="skill-main-locked">
                <LockedHint
                  title="尚未配置主心法"
                  reason="objective"
                  hint="主心法决定道基流派；先在功法册「修习」一门心法，再用下方编辑器上槽。"
                />
              </div>
            )}

            <Toolbar
              left={<Typography.Text type="secondary">装配为整组替换：保存后以本次选择为准，换装不消耗资源</Typography.Text>}
              right={
                <Button type="primary" onClick={() => setEditing(true)} disabled={panel === null} data-testid="skill-edit">
                  调整功法面板
                </Button>
              }
            />

            <div data-testid="skill-xinfa-board">
              <SlotBoard tone="skill" columns={PANEL_LIMITS.aux + 1} slots={xinfaSlotSummaries(panel).map(toSlot)} />
            </div>
            <div data-testid="skill-shufa-board">
              <SlotBoard tone="skill" columns={PANEL_LIMITS.shufa} slots={shufaSlotSummaries(panel).map(toSlot)} />
            </div>
          </Flex>
        </AsyncBoundary>
      </SectionCard>

      <SkillCatalogSection
        catalog={catalog}
        jadeSlips={jadeSlips}
        onRetry={() => void skill.load()}
        onLearn={(skillId) => void skill.learn(skillId)}
        onEnlighten={(skillId) => void skill.enlighten(skillId)}
      />

      <SectionCard title="开发者工具" subtitle="注入灵韵（仅开发环境可用，生产环境会被服务端拒绝）">
        <Toolbar
          left={<QuantityInput value={lingyun ?? undefined} onChange={setLingyun} min={1} max={1000000} placeholder="注入数量" />}
          right={
            <ConfirmAction
              title="确认注入灵韵？"
              description="开发注入会直接改动灵韵余额。"
              disabled={lingyun === null}
              onConfirm={() => skill.grantLingyun(lingyun ?? 0)}
            >
              <Button disabled={lingyun === null} data-testid="skill-lingyun-grant">
                注入灵韵
              </Button>
            </ConfirmAction>
          }
        />
      </SectionCard>

      <ModalForm
        open={editing}
        title="调整功法面板"
        fields={composerFields(catalog)}
        initialValues={composerInitialValues(panel)}
        confirmText="保存面板"
        loading={skill.loading}
        onCancel={() => setEditing(false)}
        onFinish={(values) => {
          void skill.updatePanel(composerInput(values));
          setEditing(false);
        }}
      />
    </Flex>
  );
});
