/**
 * SkillCatalogSection —— 功法册（从 `SkillPanel` 拆出，保持单文件规模与单一职责）。
 *
 * 只负责「一门功法长什么样 + 现在能对它做什么」：修习消耗玉简、参悟消耗灵韵。
 * 协议字段不上屏：`code/id` 只做 key 与 testid，`skillType` 映射中文，`school` 不展示。
 */
import { Button, Tooltip, Typography } from 'antd';
import type { SkillCatalogView } from '@idle-path/ionet-transport';
import { AsyncBoundary, ConfirmAction, ItemCard, ResourceGrid, SectionCard } from '@idle-path/ui-kit';
import { formatCompactNumber } from '../../../../domain/format.js';
import { catalogMeta, skillTypeLabel } from './presentation.js';

export interface SkillCatalogSectionProps {
  catalog: readonly SkillCatalogView[];
  /** 玉简余额；`null` 表示未知（此时不禁用，交给服务端判定）。 */
  jadeSlips: number | null;
  onRetry: () => void;
  onLearn: (skillId: number) => void;
  onEnlighten: (skillId: number) => void;
}

export function SkillCatalogSection(props: SkillCatalogSectionProps) {
  const { catalog, jadeSlips, onRetry, onLearn, onEnlighten } = props;
  const learnBlocked = jadeSlips !== null && jadeSlips < 1;

  return (
    <SectionCard title="功法册" subtitle="修习消耗 1 枚未开光玉简；参悟消耗灵韵并提升等级，效果随等级增强">
      <AsyncBoundary empty={catalog.length === 0} emptyText="暂无功法" onRetry={onRetry}>
        <div data-testid="skill-catalog">
          <ResourceGrid
            items={catalog}
            span={8}
            keyOf={(entry) => String(entry.id)}
            renderItem={(entry) => (
              <ItemCard
                name={entry.name}
                meta={catalogMeta(entry)}
                affixTexts={entry.learned ? entry.effectsTexts : []}
                footer={
                  <Typography.Text type="secondary">
                    {entry.learned
                      ? `已修习 · ${formatCompactNumber(entry.level ?? 0)} 级`
                      : `${skillTypeLabel(entry.skillType)} · 未修习`}
                  </Typography.Text>
                }
                actions={
                  entry.learned ? (
                    <ConfirmAction
                      title={`参悟「${entry.name}」？`}
                      description="参悟消耗灵韵并提升 1 级，不可撤销。"
                      onConfirm={() => onEnlighten(entry.id)}
                    >
                      <Button data-testid={`skill-enlighten-${entry.id}`}>参悟</Button>
                    </ConfirmAction>
                  ) : (
                    <Tooltip title={learnBlocked ? '玉简不足：修习需消耗 1 枚未开光玉简' : undefined}>
                      {/* 禁用按钮不触发鼠标事件，需包一层 span 才能显示浮层 */}
                      <span>
                        <Button
                          disabled={learnBlocked}
                          onClick={() => onLearn(entry.id)}
                          data-testid={`skill-learn-${entry.id}`}
                        >
                          修习
                        </Button>
                      </span>
                    </Tooltip>
                  )
                }
              />
            )}
          />
        </div>
      </AsyncBoundary>
    </SectionCard>
  );
}
