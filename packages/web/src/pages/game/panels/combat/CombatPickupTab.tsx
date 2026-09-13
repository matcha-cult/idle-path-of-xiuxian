/**
 * CombatPickupTab —— 辨宝法阵页签（掉落进包时按优先级的自动分拣规则）。
 *
 * 这里只**列表展示**规则：正赛产出经秘境挑战 / 挂机结算时，掉落按最高优先级命中第一条规则；
 * 一条都不命中则走默认动作（分解）。协议字段不上屏：`id` 只做 rowKey，
 * `affixCodes` 只报条数（词条明细属背包 / 装备域）。
 *
 * 增删改规则走 item 域的 Action（面板不自己发请求）；本页签暂为只读，
 * 缺的 store 方法见交付回报「需要主线补」。
 */
import { Flex, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DataTable, EmptyHint, RarityTag } from '@idle-path/ui-kit';
import type { PickupRuleView } from '@idle-path/ionet-transport';
import { formatCount } from '../../../../domain/format.js';
import { pickupActionLabel } from './presentation.js';

const columns: TableColumnsType<PickupRuleView> = [
  { title: '优先级', key: 'priority', width: 90, render: (_value, rule) => formatCount(rule.priority) },
  { title: '规则名', key: 'name', render: (_value, rule) => rule.name },
  {
    title: '稀有度下限',
    key: 'rarityMin',
    render: (_value, rule) => <RarityTag rarity={rule.rarityMin} />,
  },
  { title: '阶数下限', key: 'tierMin', render: (_value, rule) => `T${formatCount(rule.tierMin)}` },
  {
    title: '词条要求',
    key: 'affixCodes',
    render: (_value, rule) =>
      rule.affixCodes.length === 0 ? '不限' : `${formatCount(rule.affixCodes.length)} 条`,
  },
  { title: '命中动作', key: 'action', render: (_value, rule) => pickupActionLabel(rule.action) },
  {
    title: '状态',
    key: 'enabled',
    render: (_value, rule) => (rule.enabled ? '启用中' : '已停用'),
  },
];

export interface CombatPickupTabProps {
  rules: readonly PickupRuleView[];
  loading?: boolean;
}

export function CombatPickupTab(props: CombatPickupTabProps) {
  const { rules, loading } = props;

  if (rules.length === 0) {
    return (
      <Flex vertical gap={12} data-testid="combat-pickup-tab">
        <Typography.Text type="secondary">
          一条规则都不命中时，掉落会按默认动作「分解」处理。
        </Typography.Text>
        <EmptyHint description="尚未设置辨宝规则，掉落将全部按默认动作处理" />
      </Flex>
    );
  }

  return (
    <Flex vertical gap={12} data-testid="combat-pickup-tab">
      <Typography.Text type="secondary">
        掉落进包时按优先级从高到低匹配，命中第一条即执行；请先设置规则再挂机。
      </Typography.Text>
      <DataTable<PickupRuleView>
        columns={columns}
        dataSource={rules}
        rowKey={(rule) => String(rule.id)}
        loading={loading}
        emptyText="尚未设置辨宝规则"
      />
    </Flex>
  );
}
