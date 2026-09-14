/**
 * `FrameMeter` + `LabFrameMeter` 单测 —— 读数的**展示口径**与**采集节流**。
 *
 * 两条最要紧的：`frames = 0` 时不能显示成「0 FPS」（那看起来像卡死，实际是还没测到帧）；
 * 采集必须**每帧只写 ref、按间隔才 setState**，否则测量表自己就成了掉帧源。
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SUMMARY, summarizeFrames } from './frame-stats.js';
import { FrameMeter } from './FrameMeter.js';
import { LabFrameMeter } from './LabFrameMeter.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FrameMeter（纯展示）', () => {
  it('还没测到帧 → 显示「等待操作」，不显示 0 FPS', () => {
    render(<FrameMeter summary={EMPTY_SUMMARY} onReset={vi.fn()} />);
    expect(screen.getByTestId('map-lab-frame-meter-idle')).toHaveTextContent('等待操作');
    expect(screen.queryByTestId('map-lab-frame-meter-fps')).toBeNull();
  });

  it('无掉帧 → 成功色读数；有掉帧 → 警告色（颜色只走语义色名）', () => {
    const clean = render(<FrameMeter summary={summarizeFrames(Array.from({ length: 60 }, () => 16.7))} onReset={vi.fn()} />);
    const cleanTag = screen.getByTestId('map-lab-frame-meter-fps');
    expect(cleanTag).toHaveTextContent('60 FPS');
    expect(cleanTag.className).toContain('ant-tag-success');
    clean.unmount();

    render(<FrameMeter summary={summarizeFrames([16, 16, 50])} onReset={vi.fn()} />);
    const dirty = screen.getByTestId('map-lab-frame-meter-fps');
    expect(dirty.className).toContain('ant-tag-warning');
    expect(screen.getByTestId('map-lab-frame-meter')).toHaveAttribute('data-dropped', '1');
  });

  it('明细把窗口帧数 / 掉帧 / 最差 / 平均都写出来（验收时要能引用具体数字）', () => {
    render(<FrameMeter summary={summarizeFrames([16, 45, 16])} onReset={vi.fn()} />);
    const detail = screen.getByTestId('map-lab-frame-meter-detail');
    expect(detail).toHaveTextContent('窗口 3 帧');
    expect(detail).toHaveTextContent('掉帧 1');
    expect(detail).toHaveTextContent('最差 45.0 ms');
    expect(detail).toHaveTextContent('平均 25.7 ms');
  });

  it('复位按钮只回调（状态由容器持有）', () => {
    const onReset = vi.fn();
    render(<FrameMeter summary={EMPTY_SUMMARY} onReset={onReset} />);
    screen.getByTestId('map-lab-frame-meter-reset').click();
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe('LabFrameMeter（rAF 采集）', () => {
  /** 可控 rAF：把回调攒起来，测试里手动喂时间戳。 */
  function installFakeRaf(): { frames: FrameRequestCallback[]; cancelled: number[] } {
    const frames: FrameRequestCallback[] = [];
    const cancelled: number[] = [];
    let id = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      id += 1;
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      cancelled.push(handle);
    });
    return { frames, cancelled };
  }

  /** 推进 n 帧（每帧间隔 16ms），并跑到下一个读数提交点。 */
  function advance(frames: FrameRequestCallback[], count: number, stepMs = 16, start = 0): number {
    let now = start;
    for (let i = 0; i < count; i += 1) {
      now += stepMs;
      const next = frames.shift();
      act(() => next?.(now));
    }
    return now;
  }

  it('按间隔提交读数（每帧只写 ref，不 setState）——否则测量表自己成为掉帧源', () => {
    const { frames } = installFakeRaf();
    render(<LabFrameMeter />);
    // 起始态：还没到 250ms，读数应保持「等待操作」而不是疯狂重渲染
    advance(frames, 5, 16);
    expect(screen.getByTestId('map-lab-frame-meter-idle')).toBeInTheDocument();
    // 越过 250ms 提交点 → 出现读数
    advance(frames, 20, 16, 80);
    expect(screen.queryByTestId('map-lab-frame-meter-idle')).toBeNull();
    expect(screen.getByTestId('map-lab-frame-meter-detail')).toHaveTextContent('窗口');
  });

  it('稳定 16ms 帧 → 读数无掉帧', () => {
    const { frames } = installFakeRaf();
    render(<LabFrameMeter />);
    advance(frames, 40, 16);
    const meter = screen.getByTestId('map-lab-frame-meter');
    expect(meter).toHaveAttribute('data-dropped', '0');
    expect(Number(meter.getAttribute('data-frames'))).toBeGreaterThan(10);
  });

  it('出现长帧（>20ms）→ 掉帧计数增加（这就是真机上要看的数字）', () => {
    const { frames } = installFakeRaf();
    render(<LabFrameMeter />);
    // ⚠️ 时钟必须接着上一段走：从 0 重新计时会喂出**负数间隔**，
    // 而负数会被采集端正确丢弃（防御有效）⇒ 掉帧数停在 0，测试假绿/假红
    const clock = advance(frames, 20, 16);
    advance(frames, 6, 60, clock); // 连续长帧
    expect(Number(screen.getByTestId('map-lab-frame-meter').getAttribute('data-dropped'))).toBeGreaterThan(0);
  });

  it('复位清空窗口并回到「等待操作」', () => {
    const { frames } = installFakeRaf();
    render(<LabFrameMeter />);
    advance(frames, 30, 16);
    expect(screen.queryByTestId('map-lab-frame-meter-idle')).toBeNull();
    act(() => screen.getByTestId('map-lab-frame-meter-reset').click());
    expect(screen.getByTestId('map-lab-frame-meter-idle')).toBeInTheDocument();
  });

  it('卸载时取消 rAF（不留悬挂帧）', () => {
    const { frames, cancelled } = installFakeRaf();
    const { unmount } = render(<LabFrameMeter />);
    advance(frames, 3, 16);
    unmount();
    expect(cancelled.length).toBeGreaterThan(0);
  });
});
