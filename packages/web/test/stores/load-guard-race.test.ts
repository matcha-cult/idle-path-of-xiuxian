// @vitest-environment node
/**
 * 竞态守卫集成（规划 09 §6.2 B5）：
 * 快速连点刷新 / 切页导致两次加载在途时，**先发后到的过期响应必须被丢弃**，
 * 不得把旧数据覆盖到新数据上（stock-sim 的反模式）。
 */
import { describe, expect, it } from 'vitest';
import { ITEM_CMD } from '@idle-path/ionet-transport';
import { createPanelHarness } from '../helpers/panel-harness.js';

/** 让 page=1 的响应慢（80ms）、page=2 的快（5ms），制造「先发后到」。 */
function delayedInventoryHandler() {
  return (request: { cmd: number; subCmd: number; data?: unknown }) => {
    if (request.cmd !== ITEM_CMD.cmd || request.subCmd !== ITEM_CMD.inventory) return null;
    const page = (request.data as { page?: number } | undefined)?.page ?? 1;
    return {
      data: {
        success: true,
        message: 'ok',
        data: { total: page, page: page, pageSize: 20, items: [] },
      },
      delayMs: page === 1 ? 80 : 5,
    };
  };
}

describe('LoadGuard · 过期响应不得覆盖新数据', () => {
  it('page=1 慢响应后到，不得把 page/total 覆盖回 1', async () => {
    const harness = createPanelHarness({ handler: delayedInventoryHandler() });
    await harness.connect();

    // 第一次加载（page=1，慢）
    const slow = harness.root.item.load();
    // 立刻切到第 2 页（快），发起第二次加载
    harness.root.item.setPage(2);

    await slow;
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(harness.root.item.page).toBe(2);
    expect(harness.root.item.total).toBe(2);
    expect(harness.root.item.loading).toBe(false);
  });

  it('过期响应也不得把 error/loading 写入当前状态', async () => {
    const harness = createPanelHarness({ handler: delayedInventoryHandler() });
    await harness.connect();

    const slow = harness.root.item.load();
    harness.root.item.setPage(3);
    await slow;
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(harness.root.item.error).toBeNull();
    expect(harness.root.item.loading).toBe(false);
    expect(harness.root.item.total).toBe(3);
  });

  it('单次加载仍然正常回写（守卫不误伤）', async () => {
    const harness = createPanelHarness({ handler: delayedInventoryHandler() });
    await harness.connect();

    harness.root.item.setPage(4);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(harness.root.item.page).toBe(4);
    expect(harness.root.item.total).toBe(4);
  });
});
