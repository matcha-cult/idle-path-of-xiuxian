/**
 * 错误模型边界覆盖（06 §2 判定顺序）。
 * 覆盖：undefined/0/400/404/500 errorCode、success 的 false/true/undefined、
 * message 缺失、data.code 非字符串/缺失、非对象 body。
 */
import { describe, expect, it } from 'vitest';
import type { ResponseMessage } from '@nbb-ionet/client-protocol';
import {
  assertResponseOk,
  businessCodeOf,
  businessMessageOf,
  BusinessError,
  isBusinessFailure,
  TransportError,
  UNKNOWN_BUSINESS_CODE,
} from '../src/client/errors.js';

describe('isBusinessFailure', () => {
  it('仅严格 false 视为业务失败', () => {
    expect(isBusinessFailure({ success: false })).toBe(true);
    expect(isBusinessFailure({ success: true })).toBe(false);
    expect(isBusinessFailure({})).toBe(false);
    expect(isBusinessFailure({ success: 'false' })).toBe(false);
    expect(isBusinessFailure(null)).toBe(false);
    expect(isBusinessFailure(undefined)).toBe(false);
    expect(isBusinessFailure(0)).toBe(false);
    expect(isBusinessFailure('false')).toBe(false);
    expect(isBusinessFailure([])).toBe(false);
  });
});

describe('businessCodeOf / businessMessageOf 边界', () => {
  it('code 缺失 / 非字符串 / 空串 → UNKNOWN', () => {
    expect(businessCodeOf(undefined)).toBe(UNKNOWN_BUSINESS_CODE);
    expect(businessCodeOf(null)).toBe(UNKNOWN_BUSINESS_CODE);
    expect(businessCodeOf({})).toBe(UNKNOWN_BUSINESS_CODE);
    expect(businessCodeOf({ data: {} })).toBe(UNKNOWN_BUSINESS_CODE);
    expect(businessCodeOf({ data: { code: '' } })).toBe(UNKNOWN_BUSINESS_CODE);
    expect(businessCodeOf({ data: { code: 123 } })).toBe(UNKNOWN_BUSINESS_CODE);
    expect(businessCodeOf('str')).toBe(UNKNOWN_BUSINESS_CODE);
    expect(businessCodeOf({ data: { code: 'ITEM_NOT_FOUND' } })).toBe('ITEM_NOT_FOUND');
  });

  it('message 缺失 / 空串 / 非字符串 → undefined', () => {
    expect(businessMessageOf({})).toBeUndefined();
    expect(businessMessageOf({ message: '' })).toBeUndefined();
    expect(businessMessageOf({ message: 42 })).toBeUndefined();
    expect(businessMessageOf({ message: '  ' })).toBe('  ');
    expect(businessMessageOf({ message: '爆炸' })).toBe('爆炸');
  });
});

describe('assertResponseOk 判定顺序', () => {
  it('errorCode 缺失或 0 → 成功', () => {
    expect(() => assertResponseOk({ data: { success: true } })).not.toThrow();
    expect(() => assertResponseOk({ errorCode: 0, data: { success: true } })).not.toThrow();
  });

  it.each([400, 404, 500])('errorCode=%i → TransportError（优先于业务层）', (code) => {
    const response: ResponseMessage = { errorCode: code, errorMessage: 'boom', data: { success: false } };
    const error = (() => {
      try {
        assertResponseOk(response);
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).errorCode).toBe(code);
    expect((error as TransportError).message).toBe('boom');
  });

  it('errorCode 非 0 但无 errorMessage → 使用兜底文案', () => {
    const error = (() => {
      try {
        assertResponseOk({ errorCode: 500 });
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect((error as TransportError).message).toContain('500');
  });

  it('errorCode=0 + success=false → BusinessError（业务主路径）', () => {
    const error = (() => {
      try {
        assertResponseOk({ errorCode: 0, data: { success: false, message: '尚未创建角色', data: { code: 'CHARACTER_NOT_FOUND' } } });
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(BusinessError);
    expect((error as BusinessError).code).toBe('CHARACTER_NOT_FOUND');
    expect((error as BusinessError).message).toBe('尚未创建角色');
    expect((error as BusinessError).body).toEqual({
      success: false,
      message: '尚未创建角色',
      data: { code: 'CHARACTER_NOT_FOUND' },
    });
  });

  it('成功响应原样返回', () => {
    const response: ResponseMessage = { data: { success: true } };
    expect(assertResponseOk(response)).toBe(response);
  });
});
