/**
 * SettingsPanel —— 账号与角色 / 运行状态 / 开发工具（跨 store 聚合面板）。
 *
 * 容器模式（与 BagPanel 一致）：只做「store 状态 → ui-kit 组件 props」映射，不写业务规则；
 * 不在挂载时自动拉取；三态交给 `AsyncBoundary`；退出登录与开发注入属不可逆操作，用 `ConfirmAction` 二次确认。
 */
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Flex, Space } from 'antd';
import {
  ActionForm,
  AsyncBoundary,
  ConfirmAction,
  KeyValueList,
  QuantityInput,
  SectionCard,
  Toolbar,
  type ActionField,
  type KeyValueEntry,
} from '@idle-path/ui-kit';
import { useRootStore } from '../../../app/root-context.js';

const DEV_FIELDS: ActionField[] = [
  { kind: 'number', name: 'baseId', label: '基底 id', min: 1, required: true },
  { kind: 'number', name: 'rarity', label: '稀有度 0-3', min: 0, max: 3, required: true },
];

/** null / undefined 统一显示占位符，避免 `session.user === null` 时渲染空白。 */
const text = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? '—' : String(value);

export const SettingsPanel = observer(function SettingsPanel() {
  const root = useRootStore();
  const { session, connection, theme, prop, skill, economy, item } = root;
  const [lingyun, setLingyun] = useState(1000);
  const character = session.character;
  const ms = (value: number | null): string => (value === null ? '—' : `${value} ms`);

  const accountItems: KeyValueEntry[] = [
    { key: 'username', label: '用户名', value: text(session.user?.username) },
    { key: 'userId', label: '用户 id', value: text(session.user?.id) },
    { key: 'nickname', label: '道号', value: text(character?.nickname) },
    { key: 'characterId', label: '角色 id', value: text(character?.id) },
    { key: 'realm', label: '境界', value: text(character?.realm) },
    { key: 'resources', label: '资源', value: `灵石 ${character?.spiritStones ?? 0} · 灵韵 ${character?.lingyun ?? 0} · 玉简 ${character?.jadeSlips ?? 0}` },
  ];
  const runtimeItems: KeyValueEntry[] = [
    { key: 'state', label: '连接状态', value: connection.state },
    { key: 'latency', label: '延迟', value: ms(connection.latencyMs) },
    { key: 'acks', label: '心跳 ack', value: connection.heartbeatAcks },
    { key: 'offset', label: '服务器时钟偏移', value: ms(connection.serverTimeOffsetMs) },
    { key: 'theme', label: '主题', value: theme.isDark ? '暗色' : '亮色' },
  ];

  const devLoading = session.busy || prop.loading || skill.loading || economy.loading || item.loading;
  const devError = prop.error ?? skill.error ?? economy.error ?? item.error;

  return (
    <Flex vertical gap={12}>
      <SectionCard title="账号与角色">
        <KeyValueList bordered column={2} items={accountItems} />
        <Toolbar
          left={
            <Button onClick={() => void session.refreshCharacter()} data-testid="settings-refresh-character">
              刷新角色
            </Button>
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
      </SectionCard>

      <SectionCard title="运行状态">
        <KeyValueList bordered column={2} items={runtimeItems} />
        <Toolbar
          right={
            <Button onClick={() => theme.toggle()} data-testid="settings-theme-toggle">
              一键切换主题
            </Button>
          }
        />
      </SectionCard>

      <SectionCard title="开发工具">
        <AsyncBoundary loading={devLoading} error={devError} onRetry={() => void root.loadPanel()}>
          <Flex vertical gap={12}>
            <ActionForm
              fields={DEV_FIELDS}
              initialValues={{ baseId: 1, rarity: 0 }}
              submitText="生成物品"
              onFinish={(values) =>
                prop.generate({
                  baseId: Number(values.baseId),
                  rarity: Number(values.rarity),
                  characterId: character?.id ?? null,
                })
              }
            />
            <Toolbar
              left={
                <Space wrap>
                  <QuantityInput
                    value={lingyun}
                    min={1}
                    max={1000000}
                    onChange={(next) => setLingyun(next ?? 0)}
                  />
                  <ConfirmAction
                    title="确认注入灵韵？"
                    okText="确认注入灵韵"
                    onConfirm={() => skill.grantLingyun(lingyun)}
                  >
                    <Button data-testid="settings-grant-lingyun">注入灵韵</Button>
                  </ConfirmAction>
                  <ConfirmAction
                    title="确认注入混沌石 ×10？"
                    okText="确认注入混沌石"
                    onConfirm={() => economy.grantCurrency({ code: 'chaos', count: 10 })}
                  >
                    <Button data-testid="settings-grant-chaos">注入混沌石 ×10</Button>
                  </ConfirmAction>
                </Space>
              }
              right={
                <Button onClick={() => void item.loadBases()} data-testid="settings-load-bases">
                  拉取基底库
                </Button>
              }
            />
            <span data-testid="settings-bases-count">基底 {item.bases.length} 项</span>
          </Flex>
        </AsyncBoundary>
      </SectionCard>
    </Flex>
  );
});
