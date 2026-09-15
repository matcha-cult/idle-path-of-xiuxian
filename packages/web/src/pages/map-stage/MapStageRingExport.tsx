/**
 * 「复制环半径」按钮 —— 把当前（滑杆调过的）环半径变成一段可粘贴的常量定义。
 *
 * 为什么值得有个按钮（用户 2026-09-15 的批评：「为何不直接一个按钮在控制台打出你要的数据呢」）：
 * 让用户"把数字发我"是把转录工作推给用户，还平白多出抄错的机会。这个按钮一次做三件事：
 * 1. **写到剪贴板**（一键粘贴）；
 * 2. **打到控制台**（剪贴板被权限挡住时的退路）；
 * 3. **提示结果**（走 `App.useApp()`，本仓规矩：不用 antd 静态反馈 API）。
 */
import { CopyOutlined } from '@ant-design/icons';
import { App, Button, Tooltip } from 'antd';
import { SNIPPET_LOG_TITLE, copyText, ringRadiusSnippet } from './map-ring-snippet.js';
import type { MapRing } from './map-points.js';

export interface MapStageRingExportProps {
  /** 当前生效的环表（含滑杆改过的值） */
  rings: readonly MapRing[];
}

export function MapStageRingExport(props: MapStageRingExportProps) {
  const { rings } = props;
  const { message } = App.useApp();

  const handleCopy = (): void => {
    const snippet = ringRadiusSnippet(rings);
    // 先打控制台：即使剪贴板不可用，用户也有地方可复制（不依赖权限的退路）
    console.info(SNIPPET_LOG_TITLE, `\n${snippet}`);
    void copyText(snippet).then((copied) => {
      if (copied) {
        void message.success('已复制环半径（直接粘给我即可）');
      } else {
        void message.info('浏览器未给剪贴板权限 —— 内容已打到控制台，请从 Console 复制');
      }
    });
  };

  return (
    <Tooltip title="生成可直接贴回 map-catalog.ts 的常量定义，同时打到浏览器控制台">
      <Button type="primary" icon={<CopyOutlined />} onClick={handleCopy} data-testid="ring-export-button">
        复制环半径
      </Button>
    </Tooltip>
  );
}
