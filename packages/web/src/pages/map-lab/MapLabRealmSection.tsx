/**
 * `MapLabRealmSection` —— 秘境石台在新入口里的**就地挂载点**。
 *
 * 为什么单独一个文件：`MapLabPage` 要守住 web 的单文件 ≤200 行红线，而秘境石台需要
 * 从 `RootStore` 取 `zone` 域的四个字段 + 两个回调 —— 塞在页面里会让装配层承担读 store 的职责。
 *
 * 口径：**原样复用**既有 `RealmStoneSection`（§22 已交付并验收，一行不改）。
 * 它只在该节点带 `featureKey === 'realm'` 时挂出（判定在页面里，用 `REALM_FEATURE_KEY` 常量）。
 */
import { observer } from 'mobx-react-lite';
import { useRootStore } from '../../app/root-context.js';
import { RealmStoneSection } from '../game/panels/map/realm/RealmStoneSection.js';

export const MapLabRealmSection = observer(function MapLabRealmSection() {
  const root = useRootStore();
  return (
    <RealmStoneSection
      entries={root.zone.breakthrough}
      busyCode={root.zone.busyZoneCode}
      online={root.zone.online}
      onBreakthrough={(code) => void root.zone.startBreakthrough(code)}
      onRefreshOnline={() => void root.zone.loadOnline()}
    />
  );
});
