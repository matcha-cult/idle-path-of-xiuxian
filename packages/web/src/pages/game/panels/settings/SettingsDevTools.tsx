/**
 * SettingsDevTools —— 开发者工具折叠区（**仅开发环境可用**）。
 *
 * 三个入口各司其职，全部走 `ConfirmAction` 二次确认（不可逆写操作）：
 *   1. 生成物品：`ActionForm` → `prop.generate`（基底 id + 稀有度）；
 *   2. 注入灵韵：`skill.grantLingyun`（突破与参悟的燃料）；
 *   3. 注入混沌石：`economy.grantCurrency`（炼器最常用的工艺通货）。
 * 数量由单个受控 `QuantityInput` 提供，避免三个输入框互相打架。
 *
 * 前端拿不到 `NODE_ENV`：生产环境下这些请求会被服务端 `FORBIDDEN` 拒绝，
 * 面板只如实展示失败文案，不做本地降级判断。
 * 协议字段不上屏：`baseId` 是游戏内可见的基底图鉴序号（玩家语言），
 * `characterId` 不由玩家输入（容器按当前角色注入，不上屏）。
 */
import { useState } from 'react';
import { Button, Flex, Space, Typography } from 'antd';
import {
  ActionForm,
  ConfirmAction,
  QuantityInput,
  SectionCard,
  Toolbar,
  type ActionField,
} from '@idle-path/ui-kit';
import { RARITY_NAMES } from '@idle-path/ionet-transport';
import { DEV_GRANT_DEFAULT, DEV_GRANT_MAX, DEV_GRANT_MIN } from './presentation.js';

const DEV_FIELDS: ActionField[] = [
  { kind: 'number', name: 'baseId', label: '基底序号', min: 1, required: true },
  {
    kind: 'select',
    name: 'rarity',
    label: '稀有度',
    required: true,
    options: RARITY_NAMES.map((name, index) => ({ value: index, label: name })),
  },
];

export interface SettingsDevToolsProps {
  /** 生成物品（容器注入当前角色 id，不上屏）。 */
  onGenerate: (values: { baseId: number; rarity: number }) => void;
  /** 注入灵韵（数量由本组件持有）。 */
  onGrantLingyun: (amount: number) => void;
  /** 注入混沌石（数量由本组件持有）。 */
  onGrantChaos: (amount: number) => void;
  /** 任一 dev 请求在途。 */
  busy?: boolean;
}

export function SettingsDevTools(props: SettingsDevToolsProps) {
  const { onGenerate, onGrantLingyun, onGrantChaos, busy } = props;
  const [amount, setAmount] = useState(DEV_GRANT_DEFAULT);

  return (
    <SectionCard
      title="开发者工具"
      subtitle="仅开发环境可用；生产环境下会被服务端直接拒绝"
    >
      <Flex vertical gap={12}>
        <ActionForm
          fields={DEV_FIELDS}
          initialValues={{ baseId: 1, rarity: 0 }}
          submitText="生成物品"
          loading={busy}
          disabled={busy}
          onFinish={(values) =>
            onGenerate({ baseId: Number(values.baseId), rarity: Number(values.rarity) })
          }
        />

        <Toolbar
          left={
            <Space wrap align="center">
              <Typography.Text type="secondary">注入数量</Typography.Text>
              <QuantityInput
                value={amount}
                min={DEV_GRANT_MIN}
                max={DEV_GRANT_MAX}
                disabled={busy}
                onChange={(next) => setAmount(next ?? DEV_GRANT_MIN)}
              />
            </Space>
          }
          right={
            <Space wrap>
              <ConfirmAction
                title={`确认注入灵韵 ×${amount}？`}
                description="直接加到当前角色，该操作不可撤销。"
                okText="确认注入灵韵"
                disabled={busy}
                onConfirm={() => onGrantLingyun(amount)}
              >
                <Button data-testid="settings-grant-lingyun">注入灵韵</Button>
              </ConfirmAction>
              <ConfirmAction
                title={`确认注入混沌石 ×${amount}？`}
                description="混沌石是炼器最常用的工艺通货，该操作不可撤销。"
                okText="确认注入混沌石"
                disabled={busy}
                onConfirm={() => onGrantChaos(amount)}
              >
                <Button data-testid="settings-grant-chaos">注入混沌石</Button>
              </ConfirmAction>
            </Space>
          }
        />
      </Flex>
    </SectionCard>
  );
}
