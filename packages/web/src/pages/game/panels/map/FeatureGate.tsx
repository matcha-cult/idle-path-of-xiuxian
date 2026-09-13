/**
 * FeatureGate —— 地图上「承载的系统尚未实现」的统一渲染件（跨域通用，后续地图 2/3 复用）。
 *
 * 判据在客户端 `feature-registry.ts`：本组件只负责**表现与禁用**，不做任何实现判断。
 * `entry` 传什么就禁用什么（`cloneElement` 注入 `disabled`），因此调用方无法「忘记禁用」。
 *
 * 约定：
 * - 文案「未开放」是本组件唯一出口，各面板不要各写一套；
 * - `label` 必须是中文展示名，**禁止传 `featureKey` 原文**（协议字段不上屏）。
 */
import { Alert, Flex } from 'antd';
import { cloneElement, isValidElement, type ReactElement } from 'react';

export interface FeatureGateProps {
  /** 承载系统的中文展示名（如「灵田」）。 */
  label: string;
  /** 该系统的业务入口；未开放时统一置为禁用态。 */
  entry?: ReactElement<{ disabled?: boolean }>;
}

export function FeatureGate(props: FeatureGateProps) {
  const { label, entry } = props;
  const gated = entry !== undefined && isValidElement(entry);

  return (
    <Flex vertical gap={8} data-testid="feature-gate">
      <Alert
        type="info"
        showIcon
        data-testid="feature-gate-alert"
        title={`${label} · 未开放`}
        description="该地点承载的系统尚未开放；到达与挂机不受影响"
      />
      {gated ? (
        <div data-testid="feature-gate-entry">{cloneElement(entry, { disabled: true })}</div>
      ) : null}
    </Flex>
  );
}
