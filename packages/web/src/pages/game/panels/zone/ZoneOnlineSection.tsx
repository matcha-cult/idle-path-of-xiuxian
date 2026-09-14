/**
 * `ZoneOnlineSection` —— 历练峰实时面板（P3.0 T6）。
 *
 * 玩家在这块要回答三个问题：
 *   1. 我现在打到哪了？→ 当前层 / 总层数 + 本层击杀进度条
 *   2. 我打得动吗？→ 本层门槛 vs 我的战力（`StatCompare`）+ 卡层时的「还差 N」
 *   3. 打赢有什么？→ Boss/涨层标签 + 事件标签 + 解锁离线挂机的引导
 *
 * 口径：
 * - **数据全部来自服务端权威帧**（`ZoneOnlineData`）：本组件不读 store、不发请求、
 *   **不做任何本地推进**（R2 §4.2：客户端不本地涨层、不本地算产出）；
 * - 颜色只用 antd 预设色名 / `Tag` 语义色，禁内联 hex（`hygiene.test.ts`）；
 * - 不传 `size`（紧凑由全局 `compactAlgorithm` 承担）；
 * - 协议字段不上屏：`zone.code` / `nodeCode` 只做 key 与 testid。
 */
import { Alert, Button, Flex, Progress, Tag, Typography } from 'antd';
import type { ZoneOnlineData } from '@idle-path/ionet-transport';
import { SectionCard, StatCompare, StatGrid } from '@idle-path/ui-kit';
import {
  eventLabelsOf,
  floorKillsLabel,
  floorLabel,
  floorProgressPercent,
  realmUnlockedHint,
  rhythmText,
  statusText,
  stuckText,
  summaryText,
} from './online-presentation.js';

export interface ZoneOnlineSectionProps {
  /** 服务端权威帧；`null` = 还没读到（面板显示占位文案，不崩）。 */
  frame: ZoneOnlineData | null;
  /** 重新读一次实况（`zone.online`）。 */
  onRefresh?: () => void;
}

export function ZoneOnlineSection(props: ZoneOnlineSectionProps) {
  const { frame, onRefresh } = props;
  const percent = floorProgressPercent(frame);
  const stuck = stuckText(frame);
  const unlockHint = realmUnlockedHint(frame);
  const summary = summaryText(frame);
  const events = eventLabelsOf(frame);

  return (
    <SectionCard
      title="历练峰 · 在线打怪升阶"
      subtitle={statusText(frame)}
      extra={
        onRefresh === undefined ? null : (
          <Button onClick={onRefresh} data-testid="zone-online-refresh">
            刷新实况
          </Button>
        )
      }
    >
      <Flex vertical gap={12}>
        <div data-testid="zone-online-stats">
          <StatGrid
            items={[
              { key: 'floor', label: '当前层', value: floorLabel(frame) },
              { key: 'kills', label: '本层击杀', value: floorKillsLabel(frame) },
              { key: 'power', label: '我的战力', value: frame?.playerPower ?? 0 },
              { key: 'need', label: '本层门槛', value: frame?.floorRequirement ?? 0 },
            ]}
          />
        </div>

        <div data-testid="zone-online-progress">
          <Progress
            percent={percent}
            status={stuck === null ? 'active' : 'exception'}
            format={(value) => `本层进度 ${value ?? 0}%`}
          />
        </div>

        <div data-testid="zone-online-compare">
          <StatCompare
            label="本层战力对比"
            current={frame?.playerPower ?? 0}
            target={frame?.floorRequirement ?? 0}
            okText="打得动"
            failText="卡层"
          />
        </div>

        <Flex wrap gap={8} data-testid="zone-online-tags">
          {frame?.isBossFloor === true ? <Tag color="gold">Boss 层</Tag> : null}
          {frame?.cleared === true ? <Tag color="success">本轮已打满</Tag> : null}
          {frame !== null && frame.clears >= 1 ? <Tag color="success">已突破</Tag> : null}
          {events.map((label) => (
            <Tag key={label} color="processing">
              {label}
            </Tag>
          ))}
          {summary === null ? null : <Tag>{summary}</Tag>}
        </Flex>

        {stuck === null ? null : (
          <div data-testid="zone-online-stuck">
            <Alert type="warning" showIcon title={stuck} />
          </div>
        )}

        {unlockHint === null ? null : (
          <div data-testid="zone-online-unlock-hint">
            <Alert type="success" showIcon title={unlockHint} />
          </div>
        )}

        <Typography.Text type="secondary" data-testid="zone-online-rhythm">
          {rhythmText(frame)}
        </Typography.Text>
      </Flex>
    </SectionCard>
  );
}
