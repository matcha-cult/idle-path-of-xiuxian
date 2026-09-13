// @vitest-environment node
/**
 * ToastStore 边界：错误分层 → 文案转译、队列上限、业务码兜底。
 */
import { describe, expect, it } from 'vitest';
import { BusinessError, HandshakeError, RestError, TransportError } from '@idle-path/ionet-transport';
import { ToastStore } from '../src/stores/toast-store.js';

describe('ToastStore · 队列', () => {
  it('push 返回自增 id；超过 max 丢弃最旧', () => {
    const toast = new ToastStore();
    toast.max = 2;
    const first = toast.push({ level: 'info', title: 'a' });
    toast.push({ level: 'info', title: 'b' });
    toast.push({ level: 'info', title: 'c' });
    expect(toast.toasts).toHaveLength(2);
    expect(toast.toasts.map((t) => t.title)).toEqual(['b', 'c']);
    expect(toast.toasts.find((t) => t.id === first)).toBeUndefined();
  });

  it('dismiss / clear', () => {
    const toast = new ToastStore();
    const id = toast.success('ok');
    toast.error('bad');
    expect(toast.toasts).toHaveLength(2);
    toast.dismiss(id);
    expect(toast.toasts).toHaveLength(1);
    toast.clear();
    expect(toast.toasts).toHaveLength(0);
  });
});

describe('ToastStore.fromError · 分层文案', () => {
  it('BusinessError 优先用服务端 message，并带业务码', () => {
    const toast = new ToastStore();
    const code = toast.fromError(new BusinessError('ITEM_NOT_FOUND', '物品不存在'));
    expect(code).toBe('ITEM_NOT_FOUND');
    expect(toast.toasts[0]).toMatchObject({ level: 'error', title: '物品不存在', code: 'ITEM_NOT_FOUND' });
  });

  it('BusinessError 无 message → 本地码表兜底', () => {
    const toast = new ToastStore();
    toast.fromError(new BusinessError('CHARACTER_NOT_FOUND'));
    expect(toast.toasts[0]?.title).toContain('角色');
    expect(toast.toasts[0]?.message).toBe('[CHARACTER_NOT_FOUND]');
  });

  it.each([400, 404, 500])('TransportError(%i) → 传输层文案与码', (code) => {
    const toast = new ToastStore();
    const returned = toast.fromError(new TransportError(code, 'raw'));
    expect(returned).toBe(code);
    expect(toast.toasts[0]?.code).toBe(code);
    expect(toast.toasts[0]?.title).not.toBe('');
  });

  it('RestError 401 → 提示重新登录', () => {
    const toast = new ToastStore();
    toast.fromError(new RestError(401, 'Unauthorized'));
    expect(toast.toasts[0]?.title).toContain('重新登录');
  });

  it('RestError 其它状态 → 用 fallbackTitle', () => {
    const toast = new ToastStore();
    toast.fromError(new RestError(500, 'boom'), '拉取失败');
    expect(toast.toasts[0]?.title).toBe('拉取失败');
  });

  it('HandshakeError → 连接失败，码为 closeCode', () => {
    const toast = new ToastStore();
    toast.fromError(new HandshakeError('握手被拒', 1006));
    expect(toast.toasts[0]).toMatchObject({ title: '连接失败', code: 1006 });
  });

  it('非 Error 值也能转译', () => {
    const toast = new ToastStore();
    toast.fromError('炸了');
    expect(toast.toasts[0]?.message).toBe('炸了');
  });

  it('未知业务码走通用兜底', () => {
    const toast = new ToastStore();
    toast.fromBusinessCode('SOME_NEW_CODE', undefined);
    expect(toast.toasts[0]?.title).toBe('操作失败');
    expect(toast.toasts[0]?.message).toBe('[SOME_NEW_CODE]');
  });
});
