import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { FakeDatabase } from '../helpers/fake-db.js';

/** 与 auth.service.ts 模块加载时读取的值保持一致（模块级常量在 import 时求值）。 */
const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

function makeService(fake: FakeDatabase): AuthService {
  return new AuthService(fake as never);
}

function newUserFake(id: number | string = 1, username = 'alice'): FakeDatabase {
  return new FakeDatabase()
    .on(/SELECT id FROM users/, { rows: [] })
    .on(/INSERT INTO users/, { rows: [{ id, username }] });
}

describe('AuthService.register 用户名边界', () => {
  test('用户名为空串 -> 用户名不能为空，不触达 DB', async () => {
    const fake = new FakeDatabase();
    const res = await makeService(fake).register('', 'secret1');
    assert.equal(res.success, false);
    assert.match(res.message, /用户名不能为空/);
    assert.equal(fake.callCount, 0);
  });

  test('用户名纯空白 -> trim 后为空 -> 用户名不能为空，不触达 DB', async () => {
    const fake = new FakeDatabase();
    const res = await makeService(fake).register('   \t\n  ', 'secret1');
    assert.equal(res.success, false);
    assert.match(res.message, /用户名不能为空/);
    assert.equal(fake.callCount, 0);
  });

  test('用户名长度 2（下界−1）-> 长度校验失败，不触达 DB', async () => {
    const fake = new FakeDatabase();
    const res = await makeService(fake).register('ab', 'secret1');
    assert.equal(res.success, false);
    assert.match(res.message, /长度/);
    assert.equal(fake.callCount, 0);
  });

  test('用户名长度 3（下界）-> 通过长度校验并查询 DB', async () => {
    const fake = newUserFake(3, 'abc');
    const res = await makeService(fake).register('abc', 'secret1');
    assert.equal(res.success, true);
    assert.ok(fake.lastCall(/SELECT id FROM users/));
  });

  test('用户名长度 50（上界）-> 通过', async () => {
    const name = 'a'.repeat(50);
    const fake = newUserFake(50, name);
    const res = await makeService(fake).register(name, 'secret1');
    assert.equal(res.success, true);
    assert.equal(fake.lastCall(/INSERT INTO users/)?.params[0], name);
  });

  test('用户名长度 51（上界+1）-> 长度校验失败，不触达 DB', async () => {
    const fake = new FakeDatabase();
    const res = await makeService(fake).register('a'.repeat(51), 'secret1');
    assert.equal(res.success, false);
    assert.match(res.message, /长度/);
    assert.equal(fake.callCount, 0);
  });

  test('用户名含首尾空白且 trim 后为 2 字符 -> 长度校验失败', async () => {
    const fake = new FakeDatabase();
    const res = await makeService(fake).register('  ab  ', 'secret1');
    assert.equal(res.success, false);
    assert.match(res.message, /长度/);
    assert.equal(fake.callCount, 0);
  });
});

describe('AuthService.register 密码边界', () => {
  const cases: Array<[string | null | undefined, string]> = [
    ['', '空串'],
    ['12345', '长度 5（下界−1）'],
    [undefined, 'undefined'],
    [null, 'null'],
  ];

  for (const [value, label] of cases) {
    test('密码为 ' + label + ' -> 密码至少6个字符，不触达 DB', async () => {
      const fake = new FakeDatabase();
      const res = await makeService(fake).register('alice', value as never);
      assert.equal(res.success, false);
      assert.match(res.message, /密码/);
      assert.equal(fake.callCount, 0);
    });
  }

  test('密码长度 6（下界）-> 通过', async () => {
    const fake = newUserFake();
    const res = await makeService(fake).register('alice', '123456');
    assert.equal(res.success, true);
  });
});

describe('AuthService.register 可选缺失/类型不符', () => {
  const cases: Array<[unknown, string]> = [
    [undefined, 'undefined'],
    [null, 'null'],
    [123, '数字'],
    [{}, '对象'],
  ];

  for (const [value, label] of cases) {
    test('用户名为 ' + label + ' -> 抛 TypeError（trim 不可用），不触达 DB', async () => {
      const fake = new FakeDatabase();
      await assert.rejects(() => makeService(fake).register(value as never, 'secret1'), TypeError);
      assert.equal(fake.callCount, 0);
    });
  }
});

describe('AuthService.register 数据库分支与成功路径', () => {
  test('用户名已存在（SQL 单行）-> 用户名已存在，不 INSERT', async () => {
    const fake = new FakeDatabase().on(/SELECT id FROM users/, { rows: [{ id: 1 }] });
    const res = await makeService(fake).register('alice', 'secret1');
    assert.equal(res.success, false);
    assert.match(res.message, /已存在/);
    assert.equal(fake.callsMatching(/INSERT INTO users/).length, 0);
  });

  test('SELECT 无行 -> 进入 INSERT 分支', async () => {
    const fake = newUserFake();
    await makeService(fake).register('alice', 'secret1');
    assert.equal(fake.callsMatching(/SELECT id FROM users/).length, 1);
    assert.equal(fake.callsMatching(/INSERT INTO users/).length, 1);
  });

  test('INSERT 无行 -> 读取 rows[0] 抛 TypeError', async () => {
    const fake = new FakeDatabase()
      .on(/SELECT id FROM users/, { rows: [] })
      .on(/INSERT INTO users/, { rows: [] });
    await assert.rejects(() => makeService(fake).register('alice', 'secret1'), TypeError);
  });

  test('INSERT 多行 -> 只取首行', async () => {
    const fake = new FakeDatabase()
      .on(/SELECT id FROM users/, { rows: [] })
      .on(/INSERT INTO users/, {
        rows: [
          { id: 10, username: 'alice' },
          { id: 11, username: 'bob' },
        ],
      });
    const res = await makeService(fake).register('alice', 'secret1');
    assert.equal(res.success, true);
    assert.equal(res.data?.user.id, 10);
    assert.equal(res.data?.user.username, 'alice');
  });

  test('SELECT 抛错 -> 向上抛（DB 故障）', async () => {
    const fake = new FakeDatabase().onFallback(() => {
      throw new Error('db boom');
    });
    await assert.rejects(() => makeService(fake).register('alice', 'secret1'), /db boom/);
  });

  test('用户名前后空白 -> 落库前被 trim', async () => {
    const fake = newUserFake();
    await makeService(fake).register('   alice   ', 'secret1');
    assert.equal(fake.lastCall(/SELECT id FROM users/)?.params[0], 'alice');
    assert.equal(fake.lastCall(/INSERT INTO users/)?.params[0], 'alice');
  });

  test('成功：返回 token、密码为 bcrypt 哈希（非明文、$2 开头）、id 字符串转数字', async () => {
    const fake = new FakeDatabase()
      .on(/SELECT id FROM users/, { rows: [] })
      .on(/INSERT INTO users/, { rows: [{ id: '42', username: 'alice' }] });

    const res = await makeService(fake).register('alice', 'secret1');
    assert.equal(res.success, true);
    assert.equal(res.message, '注册成功');
    assert.equal(res.data?.user.id, 42);
    assert.equal(typeof res.data?.user.id, 'number');
    assert.equal(res.data?.user.username, 'alice');

    const token = res.data?.token ?? '';
    const decoded = makeService(fake).verifyToken(token);
    assert.equal(decoded.valid, true);
    assert.equal(decoded.decoded?.id, 42);
    assert.equal(decoded.decoded?.username, 'alice');

    const insert = fake.lastCall(/INSERT INTO users/);
    assert.ok(insert);
    assert.equal(insert?.params[0], 'alice');
    const hash = insert?.params[1];
    assert.equal(typeof hash, 'string');
    assert.notEqual(hash, 'secret1');
    assert.match(hash as string, /^\$2[aby]\$/);
    assert.equal(await bcrypt.compare('secret1', hash as string), true);
  });
});

describe('AuthService.login 边界', () => {
  test('用户名为空串 -> 不触达 DB', async () => {
    const fake = new FakeDatabase();
    const res = await makeService(fake).login('', 'secret1');
    assert.equal(res.success, false);
    assert.match(res.message, /不能为空/);
    assert.equal(fake.callCount, 0);
  });

  test('用户名纯空白 -> 不触达 DB', async () => {
    const fake = new FakeDatabase();
    const res = await makeService(fake).login('   ', 'secret1');
    assert.equal(res.success, false);
    assert.match(res.message, /不能为空/);
    assert.equal(fake.callCount, 0);
  });

  test('密码为空串 -> 不触达 DB', async () => {
    const fake = new FakeDatabase();
    const res = await makeService(fake).login('alice', '');
    assert.equal(res.success, false);
    assert.match(res.message, /不能为空/);
    assert.equal(fake.callCount, 0);
  });

  test('密码为 null -> 不触达 DB', async () => {
    const fake = new FakeDatabase();
    const res = await makeService(fake).login('alice', null as never);
    assert.equal(res.success, false);
    assert.match(res.message, /不能为空/);
    assert.equal(fake.callCount, 0);
  });

  test('用户不存在（SQL 无行）-> 用户名或密码错误', async () => {
    const fake = new FakeDatabase().on(/SELECT id, username, password/, { rows: [] });
    const res = await makeService(fake).login('nobody', 'secret1');
    assert.equal(res.success, false);
    assert.match(res.message, /用户名或密码错误/);
  });

  test('password 字段为 null（单行）-> 用户名或密码错误', async () => {
    const fake = new FakeDatabase().on(/SELECT id, username, password/, {
      rows: [{ id: 1, username: 'alice', password: null }],
    });
    const res = await makeService(fake).login('alice', 'secret1');
    assert.equal(res.success, false);
    assert.match(res.message, /用户名或密码错误/);
  });

  test('password 字段为空串 -> 用户名或密码错误', async () => {
    const fake = new FakeDatabase().on(/SELECT id, username, password/, {
      rows: [{ id: 1, username: 'alice', password: '' }],
    });
    const res = await makeService(fake).login('alice', 'secret1');
    assert.equal(res.success, false);
    assert.match(res.message, /用户名或密码错误/);
  });

  test('bcrypt 不匹配 -> 用户名或密码错误，不更新 last_login', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    const fake = new FakeDatabase().on(/SELECT id, username, password/, {
      rows: [{ id: 1, username: 'alice', password: hash }],
    });
    const res = await makeService(fake).login('alice', 'wrong-password');
    assert.equal(res.success, false);
    assert.match(res.message, /用户名或密码错误/);
    assert.equal(fake.callsMatching(/UPDATE users/).length, 0);
  });

  test('DB 多行 -> 只取首行用户', async () => {
    const hash = await bcrypt.hash('right', 4);
    const fake = new FakeDatabase().on(/SELECT id, username, password/, {
      rows: [
        { id: 1, username: 'alice', password: hash },
        { id: 2, username: 'alice2', password: hash },
      ],
    });
    const res = await makeService(fake).login('alice', 'right');
    assert.equal(res.success, true);
    assert.equal(res.data?.user.id, 1);
  });

  test('成功 -> 更新 last_login（参数为 id）并返回可验证 token', async () => {
    const hash = await bcrypt.hash('right', 4);
    const fake = new FakeDatabase()
      .on(/SELECT id, username, password/, { rows: [{ id: 7, username: 'alice', password: hash }] })
      .on(/UPDATE users SET last_login/, { rows: [] });

    const res = await makeService(fake).login('alice', 'right');
    assert.equal(res.success, true);
    assert.equal(res.message, '登录成功');

    const update = fake.lastCall(/UPDATE users SET last_login/);
    assert.deepEqual(update?.params, [7]);

    const decoded = makeService(fake).verifyToken(res.data?.token ?? '');
    assert.equal(decoded.valid, true);
    assert.equal(decoded.decoded?.id, 7);
    assert.equal(decoded.decoded?.username, 'alice');
  });

  test('成功：id 为字符串 -> 转数字返回', async () => {
    const hash = await bcrypt.hash('right', 4);
    const fake = new FakeDatabase()
      .on(/SELECT id, username, password/, { rows: [{ id: '99', username: 'alice', password: hash }] })
      .on(/UPDATE users SET last_login/, { rows: [] });
    const res = await makeService(fake).login('alice', 'right');
    assert.equal(res.success, true);
    assert.equal(res.data?.user.id, 99);
    assert.equal(typeof res.data?.user.id, 'number');
  });

  test('DB 抛错 -> 向上抛', async () => {
    const fake = new FakeDatabase().onFallback(() => {
      throw new Error('db down');
    });
    await assert.rejects(() => makeService(fake).login('alice', 'secret1'), /db down/);
  });

  test('用户名为 undefined -> 抛 TypeError（trim 不可用）', async () => {
    const fake = new FakeDatabase();
    await assert.rejects(() => makeService(fake).login(undefined as never, 'secret1'), TypeError);
    assert.equal(fake.callCount, 0);
  });
});

describe('AuthService.verifyToken 边界', () => {
  test('generateToken 产生的合法 token -> valid 且 id/username 一致', () => {
    const svc = makeService(new FakeDatabase());
    const token = svc.generateToken({ id: 42, username: 'bob' });
    const res = svc.verifyToken(token);
    assert.equal(res.valid, true);
    assert.equal(res.decoded?.id, 42);
    assert.equal(res.decoded?.username, 'bob');
  });

  test('过期 token（expiresIn: -10）-> invalid', () => {
    const svc = makeService(new FakeDatabase());
    const expired = jwt.sign({ id: 1, username: 'old' }, SECRET, { expiresIn: -10 });
    assert.deepEqual(svc.verifyToken(expired), { valid: false });
  });

  test('被篡改 token（追加字符）-> invalid', () => {
    const svc = makeService(new FakeDatabase());
    const token = svc.generateToken({ id: 1, username: 'bob' });
    assert.deepEqual(svc.verifyToken(token + 'x'), { valid: false });
  });

  test('被篡改 token（修改 payload 段）-> invalid', () => {
    const svc = makeService(new FakeDatabase());
    const token = svc.generateToken({ id: 1, username: 'bob' });
    const parts = token.split('.');
    const tampered = [parts[0], parts[1].slice(0, -2) + 'AA', parts[2]].join('.');
    assert.deepEqual(svc.verifyToken(tampered), { valid: false });
  });

  test('错误密钥签发的 token -> invalid', () => {
    const svc = makeService(new FakeDatabase());
    const forged = jwt.sign({ id: 1, username: 'bob' }, 'other-secret');
    assert.deepEqual(svc.verifyToken(forged), { valid: false });
  });

  test('空串 -> invalid', () => {
    const svc = makeService(new FakeDatabase());
    assert.deepEqual(svc.verifyToken(''), { valid: false });
  });

  test('乱码 -> invalid', () => {
    const svc = makeService(new FakeDatabase());
    assert.deepEqual(svc.verifyToken('not-a-jwt'), { valid: false });
  });

  test('三段式乱码 -> invalid', () => {
    const svc = makeService(new FakeDatabase());
    assert.deepEqual(svc.verifyToken('aaa.bbb.ccc'), { valid: false });
  });

  test('undefined -> invalid（jsonwebtoken 抛错被捕获）', () => {
    const svc = makeService(new FakeDatabase());
    assert.deepEqual(svc.verifyToken(undefined as never), { valid: false });
  });

  test('null -> invalid', () => {
    const svc = makeService(new FakeDatabase());
    assert.deepEqual(svc.verifyToken(null as never), { valid: false });
  });

  test('数字 123 -> invalid（类型不符）', () => {
    const svc = makeService(new FakeDatabase());
    assert.deepEqual(svc.verifyToken(123 as never), { valid: false });
  });
});

describe('AuthService.generateToken 边界', () => {
  test('JWT 三段式，可被 verifyToken 解回相同 id/username', () => {
    const svc = makeService(new FakeDatabase());
    const token = svc.generateToken({ id: 7, username: 'alice' });
    assert.equal(token.split('.').length, 3);
    const res = svc.verifyToken(token);
    assert.equal(res.valid, true);
    assert.equal(res.decoded?.id, 7);
    assert.equal(res.decoded?.username, 'alice');
  });

  test('不同 payload 生成不同 token', () => {
    const svc = makeService(new FakeDatabase());
    const a = svc.generateToken({ id: 1, username: 'a' });
    const b = svc.generateToken({ id: 2, username: 'b' });
    assert.notEqual(a, b);
  });

  test('id=0 / 负 id / MAX_SAFE_INTEGER 也可签发并被解回', () => {
    const svc = makeService(new FakeDatabase());
    for (const id of [0, -1, Number.MAX_SAFE_INTEGER]) {
      const res = svc.verifyToken(svc.generateToken({ id, username: 'u' }));
      assert.equal(res.valid, true);
      assert.equal(res.decoded?.id, id);
    }
  });
});
