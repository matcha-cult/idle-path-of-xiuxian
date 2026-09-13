/**
 * EconomyPanel —— 通货与炼器（器物线）。**新版**：按 `10-玩法驱动的面板设计.md` §1.5 重做。
 *
 * 玩家在这张面板上要回答三个问题（界面三段结构据此组织）：
 *   1. 每种通货是什么、怎么用、我有几个？→ 通货图鉴 / 精华图鉴（含「无掉落来源」如实标注）
 *   2. 能把选中的物品炼成什么？→ 炼器炉（选物 → 选工艺 → 定向参数 → 确认）
 *   3. 炼完变成什么样？→ 最近一次炼器结果（更强物品 / 瓦尔摧毁）
 *
 * 实现真相（`10-...md` §4-1/§4-3/§4-5）：8/13 种工艺通货没有掉落来源、`quality` 是死字段、
 * 传奇无掉落且不可洗、精华是 6 种单阶无合成——面板都按实现呈现，不照文档宣传口径写。
 * 协议字段不上屏（`code/id` 只做 key、`implemented` 转「未开放」角标、`outcome` 映射中文）。
 * 容器模式：不在挂载时拉取（首屏由 `loadPanel()` 并发加载）；三态交给 `AsyncBoundary`。
 */
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { Button, Flex, Select, Space, Typography } from 'antd';
import {
  AsyncBoundary,
  ConfirmAction,
  QuantityInput,
  ResourceGrid,
  SectionCard,
  Toolbar,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { CurrencyCard } from './economy/CurrencyCard.js';
import { CraftFurnace } from './economy/CraftFurnace.js';
import { EssenceCard } from './economy/EssenceCard.js';
import { injectOptions, injectTarget, injectTargetName } from './economy/presentation.js';

export const EconomyPanel = observer(function EconomyPanel() {
  const root = useRootStore();
  const { economy, item } = root;
  const [injectValue, setInjectValue] = useState<string | undefined>(undefined);
  const [injectCount, setInjectCount] = useState<number | null>(1);

  const target = injectTarget(injectValue);
  const targetName = injectTargetName(economy.currencies, economy.essences, injectValue);
  const canInject = target !== null && injectCount !== null && injectCount > 0;
  const empty = economy.currencies.length === 0 && economy.essences.length === 0;

  return (
    <Flex vertical gap={12}>
      <SectionCard
        title="炼器炉"
        subtitle="选中一件背包物品，用 1 枚对应工艺通货把它炼得更强（或彻底毁掉）"
        extra={
          <Button onClick={() => void economy.load()} data-testid="economy-refresh">
            刷新经济面板
          </Button>
        }
      >
        <AsyncBoundary
          loading={economy.loading}
          error={economy.error}
          empty={empty}
          emptyText="暂无通货与精华数据"
          onRetry={() => void economy.load()}
        >
          <CraftFurnace
            items={item.items}
            currencies={economy.currencies}
            essences={economy.essences}
            lastCraft={economy.lastCraft}
            loading={economy.loading}
            onCraft={(input) => void economy.craft(input)}
          />
        </AsyncBoundary>
      </SectionCard>

      <SectionCard
        title="通货图鉴"
        subtitle="每种通货对应一个炼器操作，每次消耗 1 枚；标注「无掉落来源」的当前只能靠开发者注入"
      >
        <AsyncBoundary empty={economy.currencies.length === 0} emptyText="暂无通货">
          <div data-testid="economy-currencies">
            <ResourceGrid
              items={economy.currencies}
              span={6}
              keyOf={(entry) => String(entry.id)}
              renderItem={(entry) => <CurrencyCard currency={entry} />}
            />
          </div>
        </AsyncBoundary>
      </SectionCard>

      <SectionCard title="精华图鉴" subtitle="定向保证某一词缀族；当前为 6 种单阶精华，无合成入口">
        <AsyncBoundary empty={economy.essences.length === 0} emptyText="暂无精华">
          <div data-testid="economy-essences">
            <ResourceGrid
              items={economy.essences}
              span={8}
              keyOf={(entry) => String(entry.id)}
              renderItem={(entry) => <EssenceCard essence={entry} />}
            />
          </div>
        </AsyncBoundary>
      </SectionCard>

      <SectionCard title="开发者工具" subtitle="注入通货 / 精华（仅开发环境可用，生产环境会被服务端拒绝）">
        <Toolbar
          left={
            <Space.Compact>
              <Select
                data-testid="economy-inject-select"
                placeholder="选择通货或精华"
                options={injectOptions(economy.currencies, economy.essences)}
                value={injectValue}
                allowClear
                onChange={(next: string | undefined) => setInjectValue(next)}
              />
              <QuantityInput value={injectCount ?? undefined} onChange={setInjectCount} min={1} max={9999} />
            </Space.Compact>
          }
          right={
            <Space>
              <ConfirmAction
                title={`确认注入通货「${targetName}」？`}
                description="开发注入会直接改动持有量。"
                disabled={!canInject || target?.kind !== 'currency'}
                onConfirm={() => economy.grantCurrency({ code: target?.code ?? '', count: injectCount ?? 0 })}
              >
                <Button disabled={!canInject || target?.kind !== 'currency'} data-testid="economy-grant-currency">
                  注入通货
                </Button>
              </ConfirmAction>
              <ConfirmAction
                title={`确认注入精华「${targetName}」？`}
                description="开发注入会直接改动持有量。"
                disabled={!canInject || target?.kind !== 'essence'}
                onConfirm={() => economy.grantEssence({ code: target?.code ?? '', count: injectCount ?? 0 })}
              >
                <Button disabled={!canInject || target?.kind !== 'essence'} data-testid="economy-grant-essence">
                  注入精华
                </Button>
              </ConfirmAction>
            </Space>
          }
        />
        <Typography.Text type="secondary">注入数量上限：通货 9999 / 精华 99；超出会被服务端拒绝。</Typography.Text>
      </SectionCard>
    </Flex>
  );
});
