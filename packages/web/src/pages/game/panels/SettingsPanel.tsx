/**
 * SettingsPanel —— 设置与开发者工具。**新版**：按 `10-玩法驱动的面板设计.md` §1.11 重做。
 *
 * 玩家在这张面板上要回答三个问题（三段结构据此组织）：
 *   1. 我现在是谁、账号状态如何？→「账号与角色」`KeyValueList`（用户名/道号/境界/资源）
 *   2. 界面与连接是什么样？→「界面」`ThemeToggle`（一键亮暗）+「运行状态」
 *   3. 开发期要造点什么？→「开发者工具」折叠区（生成物品 / 注入灵韵 / 注入混沌石）
 *
 * **协议诊断字段不上屏**：`token` / `userId` / `characterId` 绝不展示；`handshake ok`、
 * reqId 并发、心跳 ack、时钟偏移等实现细节属 `ConnectionDiagnostics`，不进本面板。
 * 主题只支持 light/dark 两态；**紧凑恒开、不给开关**（决策见 `packages/ui-kit/README.md`）。
 * 容器模式：不在挂载时拉取（首屏由 `loadPanel()` 并发加载）；三态交给 `AsyncBoundary`。
 * 子组件拆在同目录 `settings/` 下（单文件规模与单一职责）。
 */
import { observer } from 'mobx-react-lite';
import { Button, Flex, Typography } from 'antd';
import {
  AsyncBoundary,
  ConfirmAction,
  KeyValueList,
  SectionCard,
  ThemeToggle,
  Toolbar,
  type KeyValueEntry,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';
import { formatCompactNumber } from '../../../domain/format.js';
import { SettingsDevTools } from './settings/SettingsDevTools.js';
import {
  connectionStateLabel,
  latencyText,
  realmText,
  themeModeLabel,
  valueText,
} from './settings/presentation.js';

export const SettingsPanel = observer(function SettingsPanel() {
  const root = useRootStore();
  const { session, connection, theme, prop, skill, economy } = root;
  const character = session.character;

  const accountItems: KeyValueEntry[] = [
    { key: 'username', label: '用户名', value: valueText(session.user?.username) },
    { key: 'nickname', label: '道号', value: valueText(character?.nickname) },
    { key: 'realm', label: '境界', value: realmText(character?.realm) },
    {
      key: 'resources',
      label: '资源',
      span: 3,
      value: `灵石 ${formatCompactNumber(character?.spiritStones ?? 0)} · 灵韵 ${formatCompactNumber(
        character?.lingyun ?? 0,
      )} · 玉简 ${formatCompactNumber(character?.jadeSlips ?? 0)}`,
    },
  ];

  const runtimeItems: KeyValueEntry[] = [
    { key: 'state', label: '连接状态', value: connectionStateLabel(connection.state) },
    { key: 'latency', label: '网络延迟', value: latencyText(connection.latencyMs) },
    { key: 'theme', label: '当前主题', value: themeModeLabel(theme.mode) },
    { key: 'density', label: '界面密度', value: '紧凑（始终开启）' },
  ];

  const devBusy = prop.loading || skill.loading || economy.loading;
  const devError = prop.error ?? skill.error ?? economy.error;

  return (
    <Flex vertical gap={12}>
      <SectionCard
        title="账号与角色"
        subtitle="只显示玩家里可见的信息；登录凭证与内部编号不在此展示"
        extra={
          <Button
            onClick={() => void session.refreshCharacter()}
            loading={session.busy}
            data-testid="settings-refresh-character"
          >
            刷新角色
          </Button>
        }
      >
        <Flex vertical gap={12}>
          <AsyncBoundary empty={session.user === null && character === null} emptyText="尚未登录">
            <div data-testid="settings-account">
              <KeyValueList bordered column={{ xs: 1, sm: 2, md: 3 }} items={accountItems} />
            </div>
          </AsyncBoundary>

          <Toolbar
            left={
              <Typography.Text type="secondary">
                资源数值由服务端结算，刷新即可同步最新值
              </Typography.Text>
            }
            right={
              <ConfirmAction
                title="确认退出登录？"
                description="退出后需要重新登录才能继续游戏。"
                okText="确认退出"
                danger
                onConfirm={() => root.logout()}
              >
                <Button danger data-testid="settings-logout">
                  退出登录
                </Button>
              </ConfirmAction>
            }
          />
        </Flex>
      </SectionCard>

      <SectionCard title="界面" subtitle="主题一键切换；紧凑布局恒开（不给开关）">
        <Toolbar
          left={
            <Typography.Text type="secondary" data-testid="settings-theme-mode">
              当前为 {themeModeLabel(theme.mode)}主题
            </Typography.Text>
          }
          right={
            <ThemeToggle value={theme.mode} onChange={(mode) => theme.setMode(mode)} />
          }
        />
      </SectionCard>

      <SectionCard title="运行状态" subtitle="只保留玩家可感知的连接信息">
        <div data-testid="settings-runtime">
          <KeyValueList bordered column={{ xs: 1, sm: 2 }} items={runtimeItems} />
        </div>
      </SectionCard>

      <AsyncBoundary loading={devBusy} error={devError} onRetry={() => void root.loadPanel()}>
        <SettingsDevTools
          busy={devBusy}
          onGenerate={(values) =>
            void prop.generate({
              baseId: values.baseId,
              rarity: values.rarity,
              characterId: character?.id ?? null,
            })
          }
          onGrantLingyun={(amount) => void skill.grantLingyun(amount)}
          onGrantChaos={(amount) => void economy.grantCurrency({ code: 'chaos', count: amount })}
        />
      </AsyncBoundary>
    </Flex>
  );
});
