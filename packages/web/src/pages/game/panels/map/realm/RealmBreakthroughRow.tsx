/**
 * `RealmBreakthroughRow` —— 秘境石台上的一行（一个可突破/已突破的秘境）。
 *
 * §22 口径：
 * - **突破不校验境界、不校验战力**（"进去送人头都行"），所以这里没有战力对比、没有确认弹窗；
 * - 唯一的禁用原因是 `canBreakthrough === false`（特殊秘境需道具，本轮道具未实装）；
 * - 已突破的秘境仍然可再打一轮（用户 Q1「可重复挑战」），按钮文案随之变化。
 *
 * 协议字段不上屏：`code` 只做 key / testid；`unlockItemCode` 原文不展示。
 */
import { Button, Flex, Tag, Tooltip, Typography } from 'antd';
import type { ZoneBreakthroughView } from '@idle-path/ionet-transport';
import { zoneTierLabel } from '../../zone/presentation.js';

export interface RealmBreakthroughRowProps {
  entry: ZoneBreakthroughView;
  /** 该行正在发起突破（按钮级 loading）。 */
  busy: boolean;
  onBreakthrough: (code: string) => void;
}

export function RealmBreakthroughRow(props: RealmBreakthroughRowProps) {
  const { entry, busy, onBreakthrough } = props;
  const locked = !entry.canBreakthrough;

  return (
    <Flex gap={8} align="center" wrap data-testid={`realm-row-${entry.code}`}>
      <Typography.Text>{entry.name}</Typography.Text>
      <Tag>第 {entry.realm} 境</Tag>
      <Tag color={entry.tierKind === 'special' ? 'gold' : 'green'}>{zoneTierLabel(entry.tierKind)}</Tag>
      {entry.cleared ? (
        <Tag color="success" data-testid={`realm-cleared-${entry.code}`}>
          已突破 · {entry.clears} 轮
        </Tag>
      ) : (
        <Tag data-testid={`realm-locked-${entry.code}`}>未突破</Tag>
      )}
      <Tooltip title={locked ? '需特殊道具，后期实装' : undefined}>
        {/* 禁用按钮不触发鼠标事件，需包一层 span 才能显示浮层 */}
        <span>
          <Button
            type="primary"
            disabled={locked}
            loading={busy}
            data-testid={`realm-breakthrough-${entry.code}`}
            onClick={() => onBreakthrough(entry.code)}
          >
            {entry.cleared ? '再打一轮' : '突破'}
          </Button>
        </span>
      </Tooltip>
    </Flex>
  );
}