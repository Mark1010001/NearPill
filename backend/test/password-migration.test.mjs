import assert from 'node:assert/strict';
import { createHash, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { passwordFormat, hashPassword, verifyPassword } from '../passwords.js';
import { auditPasswordStorage } from '../audit-passwords.js';
import { createLoginHandler } from '../login-handler.js';
import { createLoginSecurity } from '../login-security.js';
import { createAuthSessionStore } from '../auth.js';

const password = ' Legacy-password<>! ';
const salt = Buffer.alloc(16, 7);
const key = await promisify(scrypt)(password, salt, 64, { N: 16384, r: 8, p: 5, maxmem: 64 * 1024 * 1024 });
const legacy = {
  plaintext: password,
  md5: `md5$${createHash('md5').update(password).digest('hex')}`,
  sha1: `sha1$${createHash('sha1').update(password).digest('hex')}`,
  scrypt: `scrypt$16384$8$5$${salt.toString('hex')}$${key.toString('hex')}`,
};
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('new password hashes use Argon2id with the required cost and distinct salts', async () => {
  const one = await hashPassword(password);
  const two = await hashPassword(password);
  assert.match(one, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.equal(passwordFormat(one), 'argon2id');
  assert.notEqual(one, two);
  assert.ok(one.length <= 255);
  assert.equal(await verifyPassword(password, one), true);
  assert.equal(await verifyPassword(password.trim(), one), false);
  assert.equal(await verifyPassword(one, one), false);
});

for (const [format, stored] of Object.entries(legacy)) {
  test(`${format} credentials migrate only after a successful login, then remain unchanged`, async t => {
    let time = 100_000;
    const security = createLoginSecurity({ now: () => time });
    t.after(() => security.close());
    const authStore = createAuthSessionStore();
    const user = { id: 1, name: 'Test User', email: 'test@example.com', role: 'customer', password: stored };
    let writes = 0;
    const pool = { async query(sql, args) {
      if (sql.startsWith('SELECT')) return [[{ ...user }]];
      assert.match(sql, /CAST\(password AS BINARY\) = CAST\(\? AS BINARY\)/);
      assert.equal(args[2], user.password);
      user.password = args[0];
      writes++;
      return [{ affectedRows: 1 }];
    } };
    const login = createLoginHandler({ pool, security, authStore, recovery: { async notify() {} } });
    const signIn = async submitted => {
      const res = response();
      await login({ body: { email: user.email, password: submitted } }, res);
      return res;
    };
    assert.equal(passwordFormat(stored), format);
    assert.equal((await signIn('Incorrect-password')).statusCode, 401);
    assert.equal(writes, 0);
    assert.equal(user.password, stored);
    time += 1000;
    assert.equal((await signIn(password)).statusCode, 200);
    assert.equal(writes, 1);
    assert.equal(passwordFormat(user.password), 'argon2id');
    assert.equal(await verifyPassword(password, user.password), true);
    const upgraded = user.password;
    assert.equal((await signIn(password)).statusCode, 200);
    assert.equal(writes, 1);
    assert.equal(user.password, upgraded);
  });
}

test('ambiguous bare digests and unsupported or corrupted hash formats require recovery', async () => {
  for (const stored of [
    createHash('md5').update(password).digest('hex'),
    createHash('sha1').update(password).digest('hex'),
    createHash('sha256').update(password).digest('hex'),
    'md5$not-a-digest', 'sha1$broken', 'scrypt$broken', '$argon2id$broken',
    '$argon2id$v=19$m=999999999,t=999999,p=9999$bad$bad',
  ]) {
    assert.ok(['ambiguous', 'unsupported'].includes(passwordFormat(stored)));
    assert.equal(await verifyPassword(password, stored), false);
    assert.equal(await verifyPassword(stored, stored), false);
  }
});

test('a concurrent password change prevents migration and session issuance', async t => {
  const security = createLoginSecurity();
  t.after(() => security.close());
  const authStore = createAuthSessionStore();
  const pool = { async query(sql) {
    return sql.startsWith('SELECT') ? [[{ id: 1, password, email: 'test@example.com' }]] : [{ affectedRows: 0 }];
  } };
  const login = createLoginHandler({ pool, security, authStore, recovery: { async notify() {} } });
  const res = response();
  await login({ body: { email: 'test@example.com', password } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(authStore.sessions.size, 0);
});

test('audit script reads in batches and returns only format counts', async () => {
  const records = [...Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, password })),
    { id: 1001, password: await hashPassword(password) },
    { id: 1002, password: legacy.md5 },
    { id: 1003, password: 'a'.repeat(32) },
  ];
  const cursors = [];
  const pool = { async query(sql, [lastId]) {
    assert.equal(sql, 'SELECT id, password FROM users WHERE id > ? ORDER BY id LIMIT 1000');
    cursors.push(lastId);
    return [records.filter(row => row.id > lastId).slice(0, 1000)];
  } };
  const counts = await auditPasswordStorage(pool);
  assert.deepEqual(cursors, [0, 1000]);
  assert.deepEqual(counts, { argon2id: 1, scrypt: 0, md5: 1, sha1: 0, plaintext: 1000, ambiguous: 1, unsupported: 0, invalid: 0 });
  assert.doesNotMatch(JSON.stringify(counts), /Legacy-password|test@example/);
});
