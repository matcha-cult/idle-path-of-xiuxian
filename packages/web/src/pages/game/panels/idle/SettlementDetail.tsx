/**
 * SettlementDetail —— 「最近一次结算」卡片（从 IdlePanel 拆出，控制容器规模）。
 *
 * ⚠️ **临时方案（TEMPORARY-OFFLINE-IDLE）**：这张卡片展示的是「离线时间兑产出」的
 * 逐层战果（`zone` + `floors`），随临时链路一起作废；终态由**战斗逻辑服**实时推进挂机战斗。
 * 标记登记表见 `ai-docs/frontend-solution-exploration/23-挂机开发交接.md` §0.1。
 *
 * §23 A3：结算结果不再是「一个单位」，而是**整轮逐层**（`zone` + `floors`）：
 * - 空分支（`kills === 0`）单独给一句说明，**不当错误**；
 * - 有战果时先给逐层清单（第 N 层 · 单位 ×击杀），再给 `SettlementSummary` 汇总。
 *
 * 纯展示、受控：不查任何数据、不发请求，通货/精华中文名由调用方给的两个列表翻译。
 */
import { Flex, Typography } from 'antd';
import type { CurrencyView, EssenceView, IdleSettleResultData } from '@idle-path/ionet-transport';
import { KeyValueList, SectionCard, SettlementSummary } from '@idle-path/ui-kit';
import { idleFloorEntries, idleSettleEntries, idleSettleSubtitle, resourceNameOf } from './presentation.js';

export interface SettlementDetailProps {
  /** 最近一次结算结果（空分支也走这里，不是错误）。 */
  last: IdleSettleResultData;
  /** 通货字典（code → 中文名）。 */
  currencies: readonly CurrencyView[];
  /** 精华字典（code → 中文名）。 */
  essences: readonly EssenceView[];
}

export function SettlementDetail(props: SettlementDetailProps) {
  const { last, currencies, essences } = props;
  const floors = idleFloorEntries(last.floors);

  return (
    <div data-testid="idle-settlement">
      <SectionCard title="最近一次结算" subtitle={idleSettleSubtitle(last)}>
        <Flex vertical gap={12}>
          {last.kills <= 0 ? (
            <Typography.Text type="secondary" data-testid="idle-settlement-empty">
              这段时间没有可结算的收益，新收益会继续累积
            </Typography.Text>
          ) : null}
          <KeyValueList column={{ xs: 1, sm: 2 }} items={idleSettleEntries(last)} />
          {floors.length === 0 ? null : (
            <div data-testid="idle-floor-list">
              <KeyValueList column={{ xs: 1, sm: 3 }} items={floors} />
            </div>
          )}
          <SettlementSummary
            lingyun={{ gained: last.lingyunGained, total: last.lingyunTotal }}
            kept={last.kept}
            salvaged={last.salvaged}
            sold={last.sold}
            discarded={last.discarded}
            blockedByTier={last.blockedByTier}
            resources={{ currencies: last.currencies, essences: last.essences }}
            nameOf={resourceNameOf(currencies, essences)}
          />
        </Flex>
      </SectionCard>
    </div>
  );
}
