import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createLoginSecurity, loginError } from '../login-security.js';
import { createLoginHandler } from '../login-handler.js';
import { createPasswordRecovery } from '../password-recovery.js';
import { createAuthSessionStore } from '../auth.js';
import { hashPassword, verifyPassword } from '../passwords.js';
import { validateAuthInput, handleAuthJsonError } from '../auth-validation.js';

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function fixture(t) {
  let time = 100_000;
  const now = () => time;
  const security = createLoginSecurity({ now });
  const authStore = createAuthSessionStore();
  const user = { id: 1, email: 'user@example.com', name: 'Test User', password: 'Original-password', role: 'customer' };
  const queries = [];
  let failUpdate = false;
  const pool = {
    async query(sql, args) {
      queries.push({ sql, args });
      if (sql.startsWith('SELECT')) return [args[0] === user.email ? [{ ...user }] : []];
      assert.ok(sql.startsWith('UPDATE users SET password = ? WHERE id = ?'));
      if (failUpdate) throw new Error('Simulated database failure');
      if (args[1] !== user.id || (args.length === 3 && args[2] !== user.password)) return [{ affectedRows: 0 }];
      user.password = args[0];
      return [{ affectedRows: 1 }];
    },
  };
  const emails = [];
  const recovery = createPasswordRecovery({
    pool, authStore, security, now, publicUrl: 'http://localhost:3001',
    sendEmail: async (...args) => { emails.push(args); return true; },
  });
  const login = createLoginHandler({ pool, authStore, security, recovery });
  t.after(() => { security.close(); recovery.close(); });
  return {
    security, authStore, user, queries, emails, recovery, login, pool,
    advance(ms) { time += ms; },
    failUpdates(value) { failUpdate = value; },
    async signIn(password = 'Wrong-password', email = user.email) {
      const res = response();
      await login({ body: { email, password } }, res);
      return res;
    },
    resetToken() { return /#token=([a-f0-9]{64})/.exec(emails.at(-1)[2])[1]; },
  };
}

test('10 login POSTs per rolling minute includes malformed requests and ignores forged forwarding headers', async t => {
  const f = fixture(t);
  t.mock.method(console, 'warn', () => {});
  const app = express();
  app.post('/api/auth/login', f.security.limitIp);
  app.use(express.json({ limit: '4kb' }), handleAuthJsonError);
  app.post('/api/auth/login', validateAuthInput('login'), f.login);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/auth/login`;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(res.status, 400);
  }
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.5' },
    body: JSON.stringify({ email: f.user.email, password: f.user.password }) };
  const blocked = await fetch(url, options);
  assert.equal(blocked.status, 401);
  assert.deepEqual(await blocked.json(), { error: loginError });
  assert.equal(blocked.headers.get('retry-after'), null);
  assert.equal(f.queries.length, 0);
  f.advance(60_000);
  assert.equal((await fetch(url, options)).status, 200);
});

test('IP budgets are independent; repeated denials do not extend the minute', t => {
  const f = fixture(t);
  let allowed = 0;
  const attempt = ip => {
    const res = response();
    f.security.limitIp({ ip }, res, () => allowed++);
    return res;
  };
  for (let i = 0; i < 10; i++) attempt('one');
  assert.equal(attempt('one').statusCode, 401);
  attempt('two');
  assert.equal(allowed, 11);
  f.advance(59_999);
  assert.equal(attempt('one').statusCode, 401);
  f.advance(1);
  attempt('one');
  assert.equal(allowed, 12);
});

test('progressive waits, fifth-failure lockout, one notification and exact 15-minute expiry', async t => {
  const f = fixture(t);
  for (let failure = 1; failure <= 5; failure++) {
    const failed = await f.signIn();
    assert.equal(failed.statusCode, 401);
    assert.deepEqual(failed.body, { error: loginError });
    const before = f.queries.length;
    const blocked = await f.signIn(f.user.password);
    assert.deepEqual(blocked.body, failed.body);
    assert.equal(f.queries.length, before);
    if (failure < 5) {
      const delay = 1000 * 2 ** (failure - 1);
      f.advance(delay - 1);
      assert.equal((await f.signIn()).statusCode, 401);
      assert.equal(f.queries.length, before);
      f.advance(1);
    }
  }
  assert.equal(f.emails.length, 1);
  assert.match(f.emails[0][2], /15 minutes/);
  assert.equal(f.resetToken().length, 64);
  f.advance(15 * 60_000 - 1);
  assert.equal((await f.signIn(f.user.password)).statusCode, 401);
  f.advance(1);
  const signedIn = await f.signIn('Original-password');
  assert.equal(signedIn.statusCode, 200);
  assert.match(signedIn.body.accessToken, /^nearpill_[a-f0-9]{64}$/);
  assert.match(f.user.password, /^scrypt\$/);
  assert.equal(await verifyPassword('Original-password', f.user.password), true);
});

test('successful logins reset consecutive failures and preserve hashed credentials', async t => {
  const f = fixture(t);
  f.user.password = await hashPassword('Actual-password');
  const stored = f.user.password;
  await f.signIn();
  f.advance(1000);
  assert.equal((await f.signIn('Actual-password')).statusCode, 200);
  assert.equal(f.user.password, stored);
  await f.signIn();
  f.advance(1000);
  assert.equal((await f.signIn('Actual-password')).statusCode, 200);
  assert.equal(f.emails.length, 0);
});

test('unknown accounts get the same cooldown and lockout responses without notifications', async t => {
  const f = fixture(t);
  for (let i = 0; i < 5; i++) {
    const res = await f.signIn('Wrong-password', 'missing@example.com');
    assert.deepEqual(res.body, { error: loginError });
    f.advance(1000 * 2 ** i);
  }
  const before = f.queries.length;
  assert.equal((await f.signIn('Any-password', 'missing@example.com')).statusCode, 401);
  assert.equal(f.queries.length, before);
  assert.equal(f.emails.length, 0);
});

test('one credential check per account prevents concurrent bypass; reset invalidates a pending login', t => {
  const f = fixture(t);
  const state = f.security.begin(f.user.email);
  assert.equal(f.security.begin(f.user.email), null);
  f.security.reset(f.user.email);
  assert.equal(f.security.succeed(f.user.email, state), false);
  f.security.release(f.user.email, state);
  const next = f.security.begin(f.user.email);
  assert.ok(next);
  f.security.release(f.user.email, next);
});

test('database failure releases the pending attempt and never creates a lockout', async t => {
  const f = fixture(t);
  t.mock.method(console, 'error', () => {});
  f.pool.query = async () => { throw new Error('Database unavailable'); };
  assert.equal((await f.signIn()).statusCode, 500);
  assert.equal((await f.signIn()).statusCode, 500);
  assert.equal(f.emails.length, 0);
});

test('password hashes have random salts, preserve characters and support exact legacy comparison', async () => {
  const password = '  á<>Script!  ';
  const first = await hashPassword(password);
  assert.notEqual(first, await hashPassword(password));
  assert.ok(first.length <= 255);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password.trim(), first), false);
  assert.equal(await verifyPassword('Original-password', 'Original-password'), true);
  assert.equal(await verifyPassword('original-password', 'Original-password'), false);
  assert.equal(await verifyPassword('Anything', undefined), false);
  assert.equal(await verifyPassword('scrypt$broken', 'scrypt$broken'), false);
});

test('reset requests hide account existence and deduplicate mail; lockout sends a fresh notification', async t => {
  const f = fixture(t);
  const known = response();
  const unknown = response();
  await f.recovery.requestReset({ body: { email: f.user.email } }, known);
  await f.recovery.requestReset({ body: { email: 'missing@example.com' } }, unknown);
  assert.deepEqual(known.body, unknown.body);
  await f.recovery.requestReset({ body: { email: f.user.email } }, response());
  assert.equal(f.emails.length, 1);
  const original = f.resetToken();
  await f.recovery.notify(f.user, true);
  assert.equal(f.emails.length, 2);
  assert.notEqual(f.resetToken(), original);
  const oldLink = response();
  await f.recovery.resetPassword({ body: { token: original, password: 'New-password' } }, oldLink);
  assert.equal(oldLink.statusCode, 400);
});

test('reset tokens are single-use, concurrent-safe, clear lockout and revoke only the account sessions', async t => {
  const f = fixture(t);
  await f.recovery.notify(f.user, true);
  const token = f.resetToken();
  const session = f.authStore.issueTokens(1);
  const other = f.authStore.issueTokens(2);
  const state = f.security.begin(f.user.email);
  for (let i = 0; i < 5; i++) f.security.fail(f.user.email, state);
  f.security.release(f.user.email, state);
  const reset = () => f.recovery.resetPassword({ body: { token, password: 'New-password' } }, response());
  const [one, two] = await Promise.all([reset(), reset()]);
  assert.deepEqual([one.statusCode, two.statusCode].sort(), [200, 400]);
  assert.equal((await reset()).statusCode, 400);
  assert.equal(await verifyPassword('New-password', f.user.password), true);
  assert.equal(f.authStore.sessions.has(session.accessToken), false);
  assert.equal(f.authStore.sessions.has(session.refreshToken), false);
  assert.equal(f.authStore.sessions.has(other.accessToken), true);
  const fresh = f.security.begin(f.user.email);
  assert.ok(fresh);
  f.security.release(f.user.email, fresh);
});

test('expired reset links cannot change the password', async t => {
  const f = fixture(t);
  await f.recovery.notify(f.user);
  const token = f.resetToken();
  f.advance(15 * 60_000);
  const res = await f.recovery.resetPassword({ body: { token, password: 'New-password' } }, response());
  assert.equal(res.statusCode, 400);
  assert.equal(f.user.password, 'Original-password');
});

test('failed reset writes leave the token retryable and existing sessions intact', async t => {
  const f = fixture(t);
  t.mock.method(console, 'error', () => {});
  await f.recovery.notify(f.user);
  const token = f.resetToken();
  const { accessToken } = f.authStore.issueTokens(1);
  f.failUpdates(true);
  const reset = () => f.recovery.resetPassword({ body: { token, password: 'New-password' } }, response());
  assert.equal((await reset()).statusCode, 500);
  assert.equal(f.authStore.sessions.has(accessToken), true);
  f.failUpdates(false);
  assert.equal((await reset()).statusCode, 200);
});
