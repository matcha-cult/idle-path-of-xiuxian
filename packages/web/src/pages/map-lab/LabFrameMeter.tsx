/**
 * `LabFrameMeter` —— 帧率读数的**容器**：rAF 采集 + 节流提交（展示全在 `FrameMeter`）。
 *
 * 采集口径：
 * - 用 `requestAnimationFrame` 的**时间戳**算帧间隔（比 `Date.now()` 准，且与浏览器合成节奏一致）；
 * - 每帧只往 `ref` 里追加（**不 setState**）—— 否则表本身就成了掉帧源，测量会污染被测对象；
 * - 每 `PUBLISH_INTERVAL_MS` 才提交一次读数（约 4 次/秒，够看且不影响手势）；
 * - 卸载时取消 rAF（不留悬挂帧）。
 *
 * 「复位」清空窗口：换一种手势（拖动 / 滚轮 / 捏合）前后分开看，比累计读数有用。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_SUMMARY, pushFrame, summarizeFrames } from './frame-stats.js';
import type { FrameSummary } from './frame-stats.js';
import { FrameMeter } from './FrameMeter.js';

/** 读数刷新间隔：约 4 次/秒。 */
const PUBLISH_INTERVAL_MS = 250;

export function LabFrameMeter() {
  const deltas = useRef<number[]>([]);
  const last = useRef<number | null>(null);
  const published = useRef(0);
  const [summary, setSummary] = useState<FrameSummary>(EMPTY_SUMMARY);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number): void => {
      if (last.current !== null) {
        deltas.current = pushFrame(deltas.current, now - last.current);
      }
      last.current = now;
      if (now - published.current >= PUBLISH_INTERVAL_MS) {
        published.current = now;
        setSummary(summarizeFrames(deltas.current));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const reset = useCallback((): void => {
    deltas.current = [];
    last.current = null;
    setSummary(EMPTY_SUMMARY);
  }, []);

  return <FrameMeter summary={summary} onReset={reset} />;
}
