/**
 * `MapLabNotice` —— 新入口的**常驻自我说明**。
 *
 * 为什么要有它：这个入口是「地图交互实践」的试验场，与旧面板**同时存在**（用户要求
 * 「保留旧页面入口」）。玩家/评审打开时必须一眼看出三件事，否则会把原型当成品：
 * 1. 这是新版链路（canvas 混合渲染），旧入口怎么回去；
 * 2. 「与传送点交互后才解锁传送」已经生效 —— 这是本轮要验证的机制；
 * 3. **传送点亮是会话态**：刷新即回初始。持久化解锁需要后端 `map.interact`，本轮不做
 *    （用户要求「非必要不修改后端」）。这条必须上屏，否则就是假装功能已完成。
 */
import { Alert } from 'antd';

export const MAP_LAB_NOTICE_TITLE = '地图交互实践入口（新链路）';
export const MAP_LAB_NOTICE_DESCRIPTION =
  'canvas 混合渲染：canvas 画点阵与连线、DOM 放枢纽；滚轮 / 双指捏合缩放、拖动平移、双击空白放大。' +
  '必须与传送点交互后才解锁传送。' +
  '⚠️ 传送点亮为**本次会话**状态（刷新即回初始），持久化解锁需后端 map.interact（下一步）。' +
  '返回旧入口：去掉地址栏的 ?mapLab=1。';

export function MapLabNotice() {
  return (
    <Alert
      type="info"
      showIcon
      data-testid="map-lab-notice"
      title={MAP_LAB_NOTICE_TITLE}
      description={MAP_LAB_NOTICE_DESCRIPTION}
    />
  );
}
