/**
 * CombatPanel —— 战斗图鉴与辨宝。**新版**：按 `10-玩法驱动的面板设计.md` §1.8 重做。
 *
 * 玩家在这张面板上要回答三个问题（三个页签正对应它们）：
 *   1. 敌人是谁、多强、打完给什么？→「单位图鉴」`ResourceGrid` + `UnitCard`（四维 `StatGrid`）
 *   2. 这张掉落表到底掉什么、各多少概率？→「掉落表」`DropPoolTable`（权重 → 概率由组件完成）
 *   3. 掉进来的东西怎么自动分拣？→「辨宝法阵」`DataTable`（只读；增删改见交付回报）
 *
 * 协议字段不上屏：`id` / `code` 只做 key 与 testid，`dropTable`/`hiddenPool` 不展示、
 * 隐藏词条内容一律不展示（§1.8 明确要求），`unitCode`/`bossCode` 不出现。
 * 容器模式：不在挂载时拉取（首屏由 `loadPanel()` 并发加载）；三态交给 `AsyncBoundary`。
 * 子组件拆在同目录 `combat/` 下（单文件规模与单一职责）。
 */
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { Button, Flex } from 'antd';
import {
  AsyncBoundary,
  PanelTabs,
  SectionCard,
  SettlementSummary,
  type PanelTabItem,
} from '@idle-path/ui-kit';
import type { UnitCatalogView } from '@idle-path/ionet-transport';
import { useRootStore } from '../../../app/root-context.js';
import { formatCount } from '../../../domain/format.js';
import { CombatDropsTab } from './combat/CombatDropsTab.js';
import { CombatPickupTab } from './combat/CombatPickupTab.js';
import { CombatUnitsTab } from './combat/CombatUnitsTab.js';
import { KILL_COUNT_MAX, KILL_COUNT_MIN } from './combat/UnitCard.js';

/**
 * 结算摘要的掉落资源：**只保留能查到中文名的 code**。
 * 查不到（economy 图鉴未加载 / 未知 code）就整条不展示——`SettlementSummary` 在
 * `nameOf` 返回空串时会回显原始 code，那正是 §1.8「协议字段不上屏」禁止的。
 */
function keepNamed(
  source: Readonly<Record<string, number>> | undefined,
  nameOf: (code: string) => string | undefined,
): Record<string, number> {
  const filtered: Record<string, number> = {};
  for (const [code, count] of Object.entries(source ?? {})) {
    if (nameOf(code) !== undefined) filtered[code] = count;
  }
  return filtered;
}

export const CombatPanel = observer(function CombatPanel() {
  const root = useRootStore();
  const { combat, economy, item } = root;
  const [dropCode, setDropCode] = useState<string | null>(null);
  const [killCount, setKillCount] = useState(KILL_COUNT_MIN);

  /** 通货 / 精华 code → 中文名（共用一次查找；查不到交给调用方给中文占位符）。 */
  const nameOf = (code: string): string | undefined =>
    [...economy.currencies, ...economy.essences].find((entry) => entry.code === code)?.name;

  /** 结算摘要的 code → 中文名：查不到给中文占位符，**绝不回显协议 code**。 */
  const settlementNameOf = (code: string): string => nameOf(code) ?? '未知掉落';

  const spawn = (unit: UnitCatalogView): void => {
    void combat.spawn({ code: unit.code });
  };
  const kill = (unit: UnitCatalogView, count: number): void => {
    void combat.kill({ code: unit.code, count });
  };

  const settlementResources = {
    currencies: keepNamed(combat.lastKill?.currencies, nameOf),
    essences: keepNamed(combat.lastKill?.essences, nameOf),
  };

  const tabs: PanelTabItem[] = [
    {
      key: 'units',
      label: '单位图鉴',
      children: (
        <CombatUnitsTab
          units={combat.units}
          total={combat.total}
          killCount={killCount}
          loading={combat.loading}
          onCountChange={(count) =>
            setKillCount(Math.min(KILL_COUNT_MAX, Math.max(KILL_COUNT_MIN, count)))
          }
          onSpawn={spawn}
          onKill={kill}
        />
      ),
    },
    {
      key: 'drops',
      label: '掉落表',
      children: (
        <CombatDropsTab
          tables={combat.dropTables}
          selectedCode={dropCode}
          onSelect={setDropCode}
          nameOf={nameOf}
          loading={combat.loading}
        />
      ),
    },
    {
      key: 'pickup',
      label: '辨宝法阵',
      children: <CombatPickupTab rules={item.pickupRules} loading={item.loading} />,
    },
  ];

  return (
    <SectionCard
      title="战斗图鉴"
      subtitle="敌人四维与掉落概率；辨宝规则决定掉落进包后的去向"
      extra={
        <Button onClick={() => void combat.load()} data-testid="combat-refresh">
          刷新图鉴
        </Button>
      }
    >
      <AsyncBoundary
        loading={combat.loading}
        error={combat.error}
        empty={
          combat.units.length === 0 &&
          combat.dropTables.length === 0 &&
          item.pickupRules.length === 0
        }
        emptyText="暂无图鉴数据"
        onRetry={() => void combat.load()}
      >
        <Flex vertical gap={12}>
          <PanelTabs items={tabs} defaultActiveKey="units" destroyOnHidden />

          <div data-testid="combat-summary">
            {`共 ${formatCount(combat.total)} 种单位 · ${formatCount(combat.dropTables.length)} 张掉落表 · ${formatCount(item.pickupRules.length)} 条辨宝规则`}
          </div>

          {/* 第三段「打完得到什么」：只有成功击杀过才渲染，null 时不出空壳。 */}
          {combat.lastKill === null ? null : (
            <div data-testid="combat-settlement">
              <SectionCard
                title="本次击杀结算"
                subtitle={`${combat.lastKill.unit.name} · 击杀 ${formatCount(combat.lastKill.kills)} 次`}
              >
                <SettlementSummary
                  lingyun={{
                    gained: combat.lastKill.lingyunGained,
                    total: combat.lastKill.lingyunTotal,
                  }}
                  kept={combat.lastKill.kept}
                  salvaged={combat.lastKill.salvaged}
                  sold={combat.lastKill.sold}
                  discarded={combat.lastKill.discarded}
                  blockedByTier={combat.lastKill.blockedByTier}
                  resources={settlementResources}
                  nameOf={settlementNameOf}
                />
              </SectionCard>
            </div>
          )}
        </Flex>
      </AsyncBoundary>
    </SectionCard>
  );
});
