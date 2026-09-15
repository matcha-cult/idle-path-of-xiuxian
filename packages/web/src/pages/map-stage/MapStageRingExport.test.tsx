/**
 * `MapStageRingExport` 单测 —— 用户 2026-09-15 的要求是「一个按钮在控制台打出你要的数据」，
 * 所以两条**退路**都必须被验证：
 *
 * 1. 剪贴板可用 ⇒ 内容进剪贴板（一键粘贴）；
 * 2. 剪贴板不可用 / 被拒 ⇒ 不炸，内容照样打到控制台（用户仍有地方可复制）。
 *
 * 必须包一层 antd `<App>`：`App.useApp()` 在 `<App>` 之外拿到的是空对象
 * （antd 的默认 context 是 `{ message: {}, ... }`），点了会抛 `message.success is not a function`。
 * 真实应用里由 `ThemeRoot → ui-kit ThemeProvider` 挂载 `<AntApp>`，所以生产路径没问题。
 */
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapStageRingExport } from './MapStageRingExport.js';
import { GATE_RING_CELLS, MAP_RINGS, PEAK_RING_CELLS, withRingRadii } from './map-points.js';
import type { MapRing } from './map-points.js';

function renderExport(rings: readonly MapRing[] = MAP_RINGS) {
  return render(
    <App>
      <MapStageRingExport rings={rings} />
    </App>,
  );
}

/**
 * 收集 `console.info` 的参数。刻意**不用** `ReturnType<typeof vi.spyOn>` 标注 spy 变量：
 * 那是泛型 `MockInstance<unknown[], unknown>`，套不上 `console.info` 的具体签名（编译期会报错）。
 */
let logged: unknown[][] = [];

beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('MapStageRingExport', () => {
  it('渲染一个「复制环半径」按钮', () => {
    renderExport();
    const button = screen.getByTestId('ring-export-button');
    expect(button).toHaveTextContent('复制环半径');
  });

  it('⭐ 点一下：内容进剪贴板 **并且** 同时打到控制台（两条路都不落空）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderExport();
    fireEvent.click(screen.getByTestId('ring-export-button'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const clipboardText = writeText.mock.calls[0]?.[0] as string;
    expect(clipboardText).toContain(`export const PEAK_RING_CELLS = ${PEAK_RING_CELLS};`);
    // 控制台的第二个参数就是同一段文本（前缀 + 换行 + 内容）
    expect(logged).toHaveLength(1);
    expect(String(logged[0]?.[1])).toContain(`export const PEAK_RING_CELLS = ${PEAK_RING_CELLS};`);
  });

  it('⭐ 剪贴板不可用时：不炸、不吞，内容仍打到控制台（退路必须存在）', async () => {
    renderExport();
    fireEvent.click(screen.getByTestId('ring-export-button'));
    await waitFor(() => expect(logged).toHaveLength(1));
    expect(String(logged[0]?.[1])).toContain(`export const GATE_RING_CELLS = ${GATE_RING_CELLS};`);
  });

  it('导出的是当前（滑杆调过的）值，不是默认值', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderExport(withRingRadii({ gate: 14, peak: 11 }));
    fireEvent.click(screen.getByTestId('ring-export-button'));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0]?.[0] as string;
    expect(text).toContain('export const GATE_RING_CELLS = 14;');
    expect(text).toContain('export const PEAK_RING_CELLS = 11;');
  });
});
