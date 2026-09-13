/**
 * CraftResult —— 最近一次炼器结果卡（从 `EconomyPanel` 拆出）。
 *
 * 成功分两支（与 `economy-store` 口径一致）：
 *   - 未摧毁：展示炼器后的物品与词条（`outcome` 原文映射中文）；
 *   - 瓦尔摧毁：物品已删除，用空态文案明确告知，**不回显内部 itemId**。
 */
import { Flex, Typography } from 'antd';
import type { CraftResultData } from '@idle-path/ionet-transport';
import { AffixList, EmptyHint, ItemCard, SectionCard } from '@idle-path/ui-kit';
import { affixEntries, outcomeLabel } from './presentation.js';

export interface CraftResultProps {
  result: CraftResultData;
}

export function CraftResult({ result }: CraftResultProps) {
  if ('destroyed' in result) {
    return (
      <SectionCard title="最近一次炼器结果" subtitle="瓦尔宝珠的摧毁分支不可逆">
        <div data-testid="economy-craft-destroyed">
          <EmptyHint compact description="该物品已在炼器中摧毁，无法找回" />
        </div>
      </SectionCard>
    );
  }

  const outcome = outcomeLabel(result.outcome);
  return (
    <SectionCard title="最近一次炼器结果" subtitle={result.item.name}>
      <Flex vertical gap={8} data-testid="economy-craft-item">
        <ItemCard
          name={result.item.name}
          tier={result.item.tier}
          rarity={result.item.rarity}
          footer={<AffixList affixes={affixEntries(result.item.affixes)} compact />}
        />
        {outcome === null ? null : <Typography.Text data-testid="economy-craft-outcome">{outcome}</Typography.Text>}
        {result.mirroredCopyId === undefined ? null : (
          <Typography.Text type="secondary">映道镜已生成一件镜像副本（副本不可再复制）</Typography.Text>
        )}
      </Flex>
    </SectionCard>
  );
}
