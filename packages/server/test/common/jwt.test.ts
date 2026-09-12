import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  signJwt,
  verifyBearerHeader,
  verifyJwt,
} from '../../src/common/auth/jwt.js';

describe('signJwt / verifyJwt 边界', () => {
  test('签发后可解回同一 payload', () => {
    const token = signJwt({ id: 42, username: 'u' });
    const decoded = verifyJwt(token);
    assert.equal(decoded?.id, 42);
    assert.equal(decoded?.username, 'u');
  });

  test('空串/乱码/篡改/错误密钥 -> null（不抛错）', () => {
    const token = signJwt({ id: 1, username: 'u' });
    for (const bad of ['', 'abc', token + 'x', token.slice(0, -1), 'a.b.c']) {
      assert.equal(verifyJwt(bad), null, bad);
    }
  });

  test('id 边界值可往返', () => {
    for (const id of [0, -1, Number.MAX_SAFE_INTEGER]) {
      const decoded = verifyJwt(signJwt({ id, username: 'u' }));
      assert.equal(decoded?.id, id);
    }
  });
});

describe('verifyBearerHeader 边界', () => {
  test('合法 Bearer 头', () => {
    const token = signJwt({ id: 7, username: 'u' });
    assert.equal(verifyBearerHeader(`Bearer ${token}`)?.id, 7);
    assert.equal(verifyBearerHeader([`Bearer ${token}`, 'ignored'])?.id, 7);
  });

  test('缺失/非 Bearer/空 token/非法 token -> null', () => {
    for (const raw of [undefined, null, '', 'Basic abc', 'Bearer', 'Bearer ', 'bearer x', 'Bearer bad.token.here'] as const) {
      assert.equal(verifyBearerHeader(raw as string | string[] | undefined), null, String(raw));
    }
  });

  test('数组首位为空串 -> null', () => {
    assert.equal(verifyBearerHeader(['', 'Bearer x']), null);
  });
});
