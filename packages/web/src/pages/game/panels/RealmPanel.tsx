/**
 * RealmPanel —— 境界（修行主线）。**新版**：按 `10-玩法驱动的面板设计.md` §1.4 重做。
 *
 * 玩家在这张面板上要回答三个问题（界面三段结构据此组织）：
 *   1. 我修到第几境、离下一境还差多少灵韵？→ `StatGrid` + `ResourceBar` + `StatCompare`
 *   2. 现在能不能破境？不能的话差什么？→ 突破按钮的禁用态与悬浮原因
 *   3. 破境后能穿什么、能进哪里？→「破境后解锁」`KeyValueList`（下一境名 / T 阶 / 可进秘境）
 *
 * **实现是必定成功的原子突破，没有成功率 / 尝试次数 / 失败判定**，因此面板绝不出现这些字样。
 * 协议字段不上屏（`nextCost=null` 只由 `isMax` 表达，字段名不展示；秘境 `code` 只做 join 键）。
 * 容器模式：不在挂载时拉取（首屏由 `loadPanel()` 并发加载）；三态交给 `AsyncBoundary`。
 */
import { observer } from 'mobx-react-lite';
import { Button, Flex, Tag, Tooltip, Typography } from 'antd';
import { REALMS, type RealmStatusData, type ZoneView } from '@idle-path/ionet-transport';
import {
  AsyncBoundary,
  ConfirmAction,
  KeyValueList,
  ResourceBar,
  SectionCard,
  StatCompare,
  StatGrid,
  Toolbar,
  type KeyValueEntry,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { formatCompactNumber } from '../../../domain/format.js';

/** 境界总数（14 境，来自协议常量，不本地硬编码）。 */
const TOTAL_REALMS = REALMS.length;

/** 下一境名（封顶或越界给占位符）。 */
function nextRealmName(realm: number, isMax: boolean): string {
  if (isMax) return '—';
  const name: string | undefined = REALMS[realm];
  return name ?? '—';
}

/** 破境后可穿的装备阶：下一境即 `T{realm+1}`，封顶则维持当前阶。 */
function wearableTier(realm: number, isMax: boolean): number {
  return isMax ? realm : realm + 1;
}

/** 破境后可进的秘境名（只 join `zone.zones`，不自行推导门槛规则）。 */
function unlockedZoneText(zones: readonly ZoneView[], targetRealm: number): string {
  const names = zones.filter((zone) => zone.minRealm <= targetRealm).map((zone) => zone.name);
  return names.length > 0 ? names.join('、') : '暂无（以秘境图鉴为准）';
}

/** 不可破境时的一句话原因；可破境返回空串。只翻译服务端字段，不含任何公式。 */
function breakthroughBlockReason(status: RealmStatusData): string {
  if (status.isMax) return '已至封顶，暂无更高境界';
  if (status.nextCost === null) return '暂无下一境消耗数据';
  if (status.lingyun < status.nextCost) {
    return `灵韵不足：还差 ${formatCompactNumber(status.nextCost - status.lingyun)}`;
  }
  return '';
}

/** 「破境后解锁」明细（下一境名 / 可穿 T 阶 / 可进秘境）。 */
function unlockEntries(status: RealmStatusData, zones: readonly ZoneView[]): KeyValueEntry[] {
  const tier = wearableTier(status.realm, status.isMax);
  return [
    {
      key: 'nextRealm',
      label: '下一境',
      value: status.isMax ? '已至封顶' : nextRealmName(status.realm, status.isMax),
    },
    { key: 'tier', label: '可穿装备阶', value: `T${formatCompactNumber(tier)}` },
    { key: 'zones', label: '可进秘境', value: unlockedZoneText(zones, tier), span: 2 },
  ];
}

export const RealmPanel = observer(function RealmPanel() {
  const root = useRootStore();
  const { realm, zone } = root;
  const status = realm.status;
  const reason = status === null ? '' : breakthroughBlockReason(status);
  const blocked = status === null || status.isMax || (status.nextCost !== null && status.lingyun < status.nextCost);
  // `nextCost=null`（封顶）与缺数据都退化为 0，绝不把 null 交给进度条。
  const nextCost = status?.nextCost ?? 0;

  return (
    <Flex vertical gap={12}>
      <SectionCard
        title="境界"
        subtitle={`共 ${TOTAL_REALMS} 境 · 灵韵是唯一的破境燃料`}
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
              <div data-testid="realm-progress-stats">
                <StatGrid
                  column={4}
                  items={[
                    {
                      key: 'realm',
                      label: '当前境界',
                      value: status.realmName,
                      suffix: `（第 ${status.realm} 境 / 共 ${TOTAL_REALMS} 境）`,
                    },
                    { key: 'lingyun', label: '剩余灵韵', value: formatCompactNumber(status.lingyun) },
                    {
                      key: 'nextCost',
                      label: '下一境消耗',
                      value: status.isMax ? '已至封顶' : formatCompactNumber(nextCost),
                    },
                    {
                      key: 'tier',
                      label: '可穿装备阶',
                      value: `T${formatCompactNumber(wearableTier(status.realm, status.isMax))}`,
                    },
                  ]}
                />
              </div>

              <div data-testid="realm-lingyun-bar">
                <ResourceBar
                  label={status.isMax ? '灵韵（已至封顶）' : '灵韵 / 下一境消耗'}
                  current={status.lingyun}
                  max={nextCost}
                  suffix={
                    status.isMax
                      ? formatCompactNumber(status.lingyun)
                      : `${formatCompactNumber(status.lingyun)} / ${formatCompactNumber(nextCost)}`
                  }
                />
              </div>

              {status.isMax ? null : (
                <div data-testid="realm-cost-compare">
                  <StatCompare
                    label="灵韵 vs 破境消耗"
                    current={status.lingyun}
                    target={nextCost}
                    okText="可以破境"
                    failText="灵韵不足"
                    tooltip="破境必定成功，消耗的灵韵不返还"
                  />
                </div>
              )}

              <Toolbar
                left={
                  <Tooltip title={reason === '' ? undefined : reason}>
                    {/* 禁用按钮不触发鼠标事件，需包一层 span 才能显示浮层 */}
                    <span>
                      <ConfirmAction
                        title={status.isMax ? '已至封顶' : `破境至「${nextRealmName(status.realm, status.isMax)}」？`}
                        description="破境消耗灵韵且不可撤销；必定晋入下一境。"
                        disabled={blocked}
                        onConfirm={() => realm.breakthrough()}
                      >
                        <Button type="primary" disabled={blocked} data-testid="realm-breakthrough">
                          {status.isMax ? '已至封顶' : '突破'}
                        </Button>
                      </ConfirmAction>
                    </span>
                  </Tooltip>
                }
                right={
                  status.isMax ? (
                    <Tag color="gold">十四境圆满</Tag>
                  ) : (
                    <Typography.Text type="secondary">破境后即可穿戴更高阶装备、进入更高门槛秘境</Typography.Text>
                  )
                }
              />
            </Flex>
          )}
        </AsyncBoundary>
      </SectionCard>

      {status === null ? null : (
        <SectionCard title="破境后解锁" subtitle="下一境可穿的装备阶与可进秘境">
          <div data-testid="realm-unlock">
            <KeyValueList column={2} items={unlockEntries(status, zone.zones)} />
          </div>
        </SectionCard>
      )}
    </Flex>
  );
});
